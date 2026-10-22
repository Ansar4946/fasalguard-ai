import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AIRunLogger } from '../ai-ops/ai-run-logger.service';
import { AIRunStatus, type AIOperation } from '../ai-ops/ai-run.enums';
import { MediaPurpose, MediaStatus } from '../media/media.enums';
import { MediaService } from '../media/media.service';
import type { CreatePesticideCheckDto, ManualPesticideCheckDto } from './dto/pesticide-check.dto';
import type { ExtractedLabelFields } from './label-fields';
import { readLabelIngredients } from './dpp-parser';
import { normalizeName } from './pesticide-normalize';
import {
  composeExplanation,
  dataSourcesFor,
  DISCLAIMER,
  evaluatePesticideRisk,
  findBannedHits,
  type BannedMatch,
  type Check,
  type Lang,
  type ListCoverage,
  type MatchedNotified,
  type MatchedProductInfo,
  type NotifiedProductInfo,
  type PremixBrandInfo,
  type RiskResult,
  type Verdict,
} from './pesticide-risk.engine';
import {
  LABEL_READER_PROVIDER,
  type LabelReaderProvider,
  type LabelReadResult,
} from './providers/label-reader.provider';

interface ProductRow extends MatchedProductInfo {
  similarity: number;
}

interface CheckRow {
  id: string;
  createdAt: Date;
  inputMode: 'photo' | 'manual';
  language: Lang;
  verdict: Verdict;
  score: number;
  demoDataset: boolean;
  listCoverage: ListCoverage;
  matchedNotified: MatchedNotified | null;
  bannedMatch: BannedMatch | null;
  extracted: Record<string, unknown>;
  matchedProductId: string | null;
  matchSimilarity: string | null;
  checks: Check[];
  provider: string;
  model: string;
  latencyMs: number;
  mpBrandName: string | null;
  mpActiveIngredient: string | null;
  mpConcentration: string | null;
  mpCompany: string | null;
}

const LABEL_OPERATION = 'LABEL_READING' as AIOperation;

@Injectable()
export class PesticideCheckService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly media: MediaService,
    private readonly aiRuns: AIRunLogger,
    @Inject(LABEL_READER_PROVIDER) private readonly reader: LabelReaderProvider,
  ) {}

  /** Photo screening: ownership-checked media -> label reader -> deterministic scoring -> saved result. */
  async createFromPhoto(userId: string, dto: CreatePesticideCheckDto): Promise<unknown> {
    const language: Lang = dto.language ?? 'en';
    const assets = await this.db.query<Array<{ id: string; purpose: string; status: string }>>(
      `SELECT id,purpose,status FROM media_assets WHERE id=$1 AND owner_id=$2`,
      [dto.mediaAssetId, userId],
    );
    const asset = assets[0];
    if (!asset)
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media was not found.' });
    if (asset.purpose !== (MediaPurpose.PesticideLabel as string))
      throw new BadRequestException({
        code: 'INVALID_LABEL_MEDIA',
        message: 'A pesticide-label photo upload is required.',
      });
    if (asset.status !== (MediaStatus.Ready as string))
      throw new BadRequestException({
        code: 'MEDIA_NOT_READY',
        message: 'The photo upload is not complete yet.',
      });
    const access = await this.media.accessUrl(userId, dto.mediaAssetId);

    const started = new Date();
    let read: LabelReadResult;
    try {
      read = await this.reader.read({ imageUrl: access.url, languageHint: language });
    } catch (error) {
      await this.aiRuns.record({
        userId,
        operation: LABEL_OPERATION,
        provider: 'LABEL_READER',
        model: 'unknown',
        status: AIRunStatus.Failed,
        startedAt: started,
        completedAt: new Date(),
        inputType: 'pesticide-label',
        errorCode: 'LABEL_READ_FAILED',
      });
      throw error;
    }
    const latencyMs = Date.now() - started.getTime();
    const overall = read.confidence.overall;
    const risk = await this.assess({
      inputMode: 'photo',
      fields: read.fields,
      rawText: read.rawText,
      ocrConfidence: overall,
      priceRs: dto.priceRs,
      packSize: dto.packSize,
    });
    const id = await this.save(userId, {
      mediaAssetId: dto.mediaAssetId,
      inputMode: 'photo',
      language,
      extracted: { ...read.fields, rawText: read.rawText, confidence: read.confidence },
      risk,
      provider: read.provider,
      model: read.model,
      latencyMs,
    });
    await this.aiRuns.record({
      userId,
      operation: LABEL_OPERATION,
      provider: read.provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      model: read.model,
      status: AIRunStatus.Completed,
      startedAt: started,
      completedAt: new Date(),
      inputType: 'pesticide-label',
      confidence: typeof overall === 'number' ? overall : null,
      sourceTable: 'pesticide_checks',
      sourceId: id,
    });
    return this.get(userId, id);
  }

  /** Typed-in screening: no model call, same scoring engine. */
  async createManual(userId: string, dto: ManualPesticideCheckDto): Promise<unknown> {
    const language: Lang = dto.language ?? 'en';
    const started = Date.now();
    const fields: ExtractedLabelFields = {
      brandName: dto.brandName,
      ...(dto.activeIngredient ? { activeIngredient: dto.activeIngredient } : {}),
      ...(dto.registrationNo ? { registrationNo: dto.registrationNo } : {}),
      ...(dto.expiryDate ? { expiryDate: dto.expiryDate } : {}),
    };
    const risk = await this.assess({
      inputMode: 'manual',
      fields,
      rawText: '',
      priceRs: dto.priceRs,
      packSize: dto.packSize,
    });
    const id = await this.save(userId, {
      mediaAssetId: null,
      inputMode: 'manual',
      language,
      extracted: { ...fields },
      risk,
      provider: 'manual',
      model: 'user-entry',
      latencyMs: Date.now() - started,
    });
    return this.get(userId, id);
  }

  async list(userId: string): Promise<unknown[]> {
    const rows = await this.db.query<
      Array<{
        id: string;
        createdAt: Date;
        verdict: Verdict;
        score: number;
        demoDataset: boolean;
        brandName: string | null;
      }>
    >(
      `SELECT id,created_at "createdAt",verdict,score,demo_dataset "demoDataset",extracted->>'brandName' "brandName"
       FROM pesticide_checks WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 20`,
      [userId],
    );
    return rows;
  }

  async get(userId: string, id: string): Promise<unknown> {
    const rows = await this.db.query<CheckRow[]>(
      `SELECT c.id,c.created_at "createdAt",c.input_mode "inputMode",c.language,c.verdict,c.score,c.demo_dataset "demoDataset",
              c.list_coverage "listCoverage",c.matched_notified "matchedNotified",c.banned_match "bannedMatch",
              c.extracted,c.matched_product_id "matchedProductId",c.match_similarity "matchSimilarity",c.checks,
              c.provider,c.model,c.latency_ms "latencyMs",
              p.brand_name "mpBrandName",p.active_ingredient "mpActiveIngredient",p.concentration "mpConcentration",p.company "mpCompany"
       FROM pesticide_checks c LEFT JOIN pesticide_products p ON p.id=c.matched_product_id
       WHERE c.id=$1 AND c.user_id=$2`,
      [id, userId],
    );
    const row = rows[0];
    if (!row)
      throw new NotFoundException({ code: 'CHECK_NOT_FOUND', message: 'Check was not found.' });
    return this.present(row);
  }

  /** Autocomplete over the reference list (max 10). */
  async searchProducts(search: string | undefined): Promise<unknown[]> {
    const q = normalizeName(search);
    if (q.length < 2) return [];
    return this.db.query(
      `SELECT id,brand_name "brandName",active_ingredient "activeIngredient",concentration,formulation,company,is_demo "isDemo"
       FROM pesticide_products
       WHERE brand_normalized LIKE '%' || $1 || '%' OR brand_normalized % $1
       ORDER BY (brand_normalized LIKE $1 || '%') DESC,similarity(brand_normalized,$1) DESC,brand_name
       LIMIT 10`,
      [q],
    );
  }

  private async assess(input: {
    inputMode: 'photo' | 'manual';
    fields: ExtractedLabelFields;
    rawText: string;
    ocrConfidence?: number;
    priceRs?: number;
    packSize?: string;
  }): Promise<RiskResult & { productId: string | null; similarity: number | null }> {
    const brandKey = normalizeName(input.fields.brandName);
    let match: { product: MatchedProductInfo; similarity: number } | null = null;
    if (brandKey) {
      const rows = await this.db.query<ProductRow[]>(
        `SELECT id,brand_name "brandName",active_ingredient "activeIngredient",concentration,company,
                registration_no "registrationNo",reference_price_rs::float8 "referencePriceRs",pack_size "packSize",
                is_demo "isDemo",similarity(brand_normalized,$1)::float8 similarity
         FROM pesticide_products WHERE brand_normalized % $1 ORDER BY similarity DESC,brand_name LIMIT 1`,
        [brandKey],
      );
      const top = rows[0];
      if (top) {
        const { similarity, ...product } = top;
        match = { product, similarity };
      }
    }
    const banned = await this.db.query<
      Array<{
        ingredient: string;
        ingredientNormalized: string;
        reason: string | null;
        isDemo: boolean;
        position: string | null;
        notificationNumber: string | null;
        notificationDate: string | null;
      }>
    >(
      `SELECT ingredient,ingredient_normalized "ingredientNormalized",reason,is_demo "isDemo",
              position_in_pakistan "position",notification_number "notificationNumber",
              to_char(notification_date,'YYYY-MM-DD') "notificationDate"
       FROM banned_pesticide_ingredients`,
    );
    const bannedHits = findBannedHits(
      [input.fields.activeIngredient, input.fields.brandName, input.rawText],
      banned,
    );
    const demoOnly = await this.db.query<Array<{ demoOnly: boolean }>>(
      `SELECT (NOT EXISTS(SELECT 1 FROM pesticide_products WHERE NOT is_demo)
               AND NOT EXISTS(SELECT 1 FROM banned_pesticide_ingredients WHERE NOT is_demo)) "demoOnly"`,
    );
    // Official DPP lists (small: 139 notified rows, 9 premix brands). Absent tables/rows = legacy demo behaviour.
    const notified = await this.db.query<NotifiedProductInfo[]>(
      `SELECT serial,product_text "productText",ingredients_normalized "ingredientsNormalized",
              concentration_text "concentrationText",formulations,category,who_class "whoClass",notification
       FROM dpp_notified_products ORDER BY serial`,
    );
    const premixBrands = await this.db.query<PremixBrandInfo[]>(
      `SELECT brand_name "brandName",brand_normalized "brandNormalized",formulation,common_name "commonName",
              ingredients_normalized "ingredientsNormalized",notification_number "notificationNumber",
              to_char(notification_date,'YYYY-MM-DD') "notificationDate"
       FROM banned_pesticide_products`,
    );
    const dppLoaded = notified.length > 0 && banned.some((b) => !b.isDemo);
    const labelIng = readLabelIngredients(input.fields, input.rawText);
    const risk = evaluatePesticideRisk({
      inputMode: input.inputMode,
      fields: input.fields,
      rawText: input.rawText,
      ocrConfidence: input.ocrConfidence,
      match,
      bannedHits,
      referenceListIsDemo: Boolean(demoOnly[0]?.demoOnly),
      dppLoaded,
      notified,
      premixBrands,
      labelIngredients: labelIng.ingredients,
      labelConcentrations: labelIng.concentrations,
      labelFormulations: labelIng.formulations,
      priceRs: input.priceRs,
      packSize: input.packSize,
    });
    const used = match && match.similarity >= 0.45 ? match : null;
    return {
      ...risk,
      productId: used?.product.id ?? null,
      similarity: used?.similarity ?? null,
    };
  }

  private async save(
    userId: string,
    s: {
      mediaAssetId: string | null;
      inputMode: 'photo' | 'manual';
      language: Lang;
      extracted: Record<string, unknown>;
      risk: RiskResult & { productId: string | null; similarity: number | null };
      provider: string;
      model: string;
      latencyMs: number;
    },
  ): Promise<string> {
    if (s.risk.checks.length === 0)
      throw new UnprocessableEntityException('No checks were produced.');
    const rows = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO pesticide_checks(user_id,media_asset_id,input_mode,extracted,matched_product_id,match_similarity,verdict,score,demo_dataset,checks,language,provider,model,latency_ms,list_coverage,matched_notified,banned_match)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb) RETURNING id`,
      [
        userId,
        s.mediaAssetId,
        s.inputMode,
        JSON.stringify(s.extracted),
        s.risk.productId,
        s.risk.similarity,
        s.risk.verdict,
        s.risk.score,
        s.risk.demoDataset,
        JSON.stringify(s.risk.checks),
        s.language,
        s.provider,
        s.model,
        Math.min(s.latencyMs, 2_000_000_000),
        s.risk.listCoverage,
        s.risk.matchedNotified ? JSON.stringify(s.risk.matchedNotified) : null,
        s.risk.bannedMatch ? JSON.stringify(s.risk.bannedMatch) : null,
      ],
    );
    return rows[0]!.id;
  }

  private present(row: CheckRow): unknown {
    const result: RiskResult = {
      verdict: row.verdict,
      score: row.score,
      demoDataset: row.demoDataset,
      checks: row.checks,
      listCoverage: row.listCoverage,
      matchedNotified: row.matchedNotified,
      bannedMatch: row.bannedMatch,
    };
    return {
      id: row.id,
      createdAt: row.createdAt,
      inputMode: row.inputMode,
      language: row.language,
      verdict: row.verdict,
      score: row.score,
      demoDataset: row.demoDataset,
      listCoverage: row.listCoverage,
      dataSources: dataSourcesFor(row.listCoverage),
      matchedNotified: row.matchedNotified,
      bannedMatch: row.bannedMatch,
      extracted: row.extracted,
      matchedProduct: row.matchedProductId
        ? {
            id: row.matchedProductId,
            brandName: row.mpBrandName,
            activeIngredient: row.mpActiveIngredient,
            concentration: row.mpConcentration,
            company: row.mpCompany,
            similarity: row.matchSimilarity === null ? null : Number(row.matchSimilarity),
          }
        : null,
      checks: row.checks,
      explanation: composeExplanation(result, row.language),
      disclaimer: DISCLAIMER,
      provider: row.provider,
      model: row.model,
      latencyMs: row.latencyMs,
    };
  }
}
