import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { CropCycleStatus } from '../farms/farm.enums';
import {
  WEATHER_PROVIDER,
  type WeatherBundle,
  type WeatherProvider,
} from './providers/weather.provider';
import type { EvaluatedRule, WeatherRuleEvaluation } from './weather-rules.engine';
import { RuleValidationStatus } from './weather.enums';
import { WeatherRulesEngine } from './weather-rules.engine';
import { RiskAssessmentService } from '../risk/risk.service';
import { RiskTrigger } from '../risk/risk.enums';
interface FieldContext {
  id: string;
  latitude: number;
  longitude: number;
  cropCycleId: string | null;
  cropId: string | null;
  cropName: string | null;
}
@Injectable()
export class WeatherService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
    @Inject(WEATHER_PROVIDER) private readonly provider: WeatherProvider,
    private readonly engine: WeatherRulesEngine,
    private readonly config: ConfigService,
    private readonly fieldRisk: RiskAssessmentService,
  ) {}
  async current(userId: string, fieldId: string): Promise<unknown> {
    const context = await this.context(userId, fieldId);
    const bundle = await this.bundle(context);
    return {
      fieldId,
      provider: bundle.provider,
      observedAt: bundle.current.time,
      weather: bundle.current,
      cachePolicy: this.cachePolicy(),
    };
  }
  async forecast(userId: string, fieldId: string): Promise<unknown> {
    const context = await this.context(userId, fieldId);
    const bundle = await this.bundle(context);
    return {
      fieldId,
      provider: bundle.provider,
      timezone: bundle.timezone,
      generatedAt: bundle.fetchedAt,
      hourly: bundle.hourly,
      cachePolicy: this.cachePolicy(),
    };
  }
  async risks(userId: string, fieldId: string): Promise<unknown> {
    return this.assess(userId, fieldId);
  }
  async suitability(userId: string, fieldId: string): Promise<unknown> {
    const result = await this.assess(userId, fieldId);
    return {
      fieldId,
      crop: result.crop,
      assessment: result.assessment,
      productionAssessment: result.productionAssessment,
      recommendationAllowed: result.recommendationAllowed,
      disclaimer: result.disclaimer,
      ruleProvenance: result.ruleProvenance,
    };
  }
  private async assess(
    userId: string,
    fieldId: string,
  ): Promise<
    WeatherRuleEvaluation & {
      fieldId: string;
      crop: string | null;
      provider: string;
      ruleProvenance: { hasExpertApprovedRules: boolean; demoRuleCount: number };
    }
  > {
    const context = await this.context(userId, fieldId);
    const bundle = await this.bundle(context);
    const rules = context.cropId
      ? await this.db.query<EvaluatedRule[]>(
          `SELECT id,category,suitability,priority,conditions,message,source,validation_status AS "validationStatus" FROM crop_weather_rules WHERE crop_id=$1 AND active=true AND validation_status IN ('DEMO_UNVERIFIED','EXPERT_APPROVED') ORDER BY priority DESC,id`,
          [context.cropId],
        )
      : [];
    const evaluated = this.engine.evaluate([bundle.current, ...bundle.hourly], rules);
    const provenance = {
      hasExpertApprovedRules: rules.some(
        (x) => x.validationStatus === RuleValidationStatus.ExpertApproved,
      ),
      demoRuleCount: rules.filter((x) => x.validationStatus === RuleValidationStatus.DemoUnverified)
        .length,
    };
    await this.db.query(
      `INSERT INTO weather_risk_assessments(field_id,crop_cycle_id,assessed_at,overall_suitability,risks,validation_summary) VALUES($1,$2,now(),$3,$4,$5)`,
      [
        fieldId,
        context.cropCycleId,
        evaluated.assessment,
        JSON.stringify(evaluated.matches),
        JSON.stringify(provenance),
      ],
    );
    return {
      fieldId,
      crop: context.cropName,
      provider: bundle.provider,
      ...evaluated,
      ruleProvenance: provenance,
    };
  }
  private async context(userId: string, fieldId: string): Promise<FieldContext> {
    const rows = await this.db.query<FieldContext[]>(
      `SELECT fi.id,ST_Y(fi.centroid)::float AS latitude,ST_X(fi.centroid)::float AS longitude,cc.id AS "cropCycleId",cc.crop_id AS "cropId",c.name AS "cropName" FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_profile_id LEFT JOIN LATERAL (SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status=$3 AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1) cc ON true LEFT JOIN crops c ON c.id=cc.crop_id WHERE fi.id=$1 AND fi.deleted_at IS NULL AND fp.user_id=$2`,
      [fieldId, userId, CropCycleStatus.Active],
    );
    if (rows[0]) return rows[0];
    const exists = await this.db.query<Array<{ exists: number }>>(
      `SELECT 1 AS exists FROM fields WHERE id=$1 AND deleted_at IS NULL`,
      [fieldId],
    );
    if (exists.length) throw new ForbiddenException('You do not have access to this field.');
    throw new NotFoundException('Field not found.');
  }
  private async bundle(context: FieldContext): Promise<WeatherBundle> {
    const rounded = `${context.latitude.toFixed(3)}:${context.longitude.toFixed(3)}`;
    const key = `weather:open-meteo:${rounded}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as WeatherBundle;
    const value = await this.provider.getWeather(context.latitude, context.longitude);
    const ttl = this.config.get<number>('weatherCacheTtlSeconds', 900);
    await this.redis.setJson(key, value, ttl);
    await this.persist(context.id, value);
    return value;
  }
  private async persist(fieldId: string, b: WeatherBundle): Promise<void> {
    const bucket = new Date(Math.floor(new Date(b.fetchedAt).getTime() / 900000) * 900000);
    await this.db.query(
      `INSERT INTO weather_snapshots(field_id,provider,observed_at,cache_bucket,values,raw_metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [
        fieldId,
        b.provider,
        b.current.time,
        bucket,
        JSON.stringify(b.current),
        JSON.stringify(b.rawMetadata),
      ],
    );
    const first = b.hourly[0];
    if (first)
      await this.db.query(
        `INSERT INTO weather_forecasts(field_id,provider,generated_at,valid_from,valid_to,cache_bucket,points) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [
          fieldId,
          b.provider,
          b.fetchedAt,
          first.time,
          b.hourly.at(-1)?.time ?? first.time,
          bucket,
          JSON.stringify(b.hourly),
        ],
      );
    await this.fieldRisk.enqueue(fieldId, RiskTrigger.Weather);
  }
  private cachePolicy(): {
    sharedProviderFetch: boolean;
    ttlSeconds: number;
    coordinatePrecisionDecimals: number;
  } {
    return {
      sharedProviderFetch: true,
      ttlSeconds: this.config.get<number>('weatherCacheTtlSeconds', 900),
      coordinatePrecisionDecimals: 3,
    };
  }
}
