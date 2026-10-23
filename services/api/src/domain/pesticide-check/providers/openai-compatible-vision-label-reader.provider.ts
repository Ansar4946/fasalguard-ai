import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractLabelFields, LABEL_FIELD_KEYS, type ExtractedLabelFields } from '../label-fields';
import { downloadLabelImage, preprocessForVision, type FetchLike } from './label-image';
import type { LabelReaderProvider, LabelReadInput, LabelReadResult } from './label-reader.provider';

export const VISION_TIMEOUT_MS = 20_000;

export const VISION_SYSTEM_PROMPT =
  'You read pesticide product labels from photos. Reply with ONE JSON object and nothing else, no markdown. ' +
  'Keys: rawText (string, all legible text on the label), brandName, activeIngredient, concentration, formulation, ' +
  'company, registrationNo, batchNo, manufacturingDate, expiryDate (each a string, or null when not clearly visible), ' +
  'and confidence (object mapping each of those field names to a number between 0 and 1). ' +
  'Never guess: use null for anything you cannot read. Do not add explanations.';

export type VisionFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Strict validation of the model JSON: unknown keys dropped, non-strings rejected, lengths capped. */
export function parseVisionLabelJson(
  content: string,
): { rawText: string; fields: ExtractedLabelFields; confidence: Record<string, number> } | null {
  let data: unknown;
  try {
    data = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  const rawText = obj.rawText;
  if (typeof rawText !== 'string' || rawText.length > 20_000) return null;
  const fields: ExtractedLabelFields = {};
  for (const key of LABEL_FIELD_KEYS) {
    const v = obj[key];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v !== 'string' || v.length > 200) return null;
    fields[key] = v.trim();
  }
  const confidence: Record<string, number> = {};
  const rawConfidence = obj.confidence;
  if (rawConfidence !== undefined && rawConfidence !== null) {
    if (typeof rawConfidence !== 'object' || Array.isArray(rawConfidence)) return null;
    for (const [k, v] of Object.entries(rawConfidence as Record<string, unknown>)) {
      if (!(LABEL_FIELD_KEYS as readonly string[]).includes(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
      confidence[k] = v;
    }
  }
  return { rawText, fields, confidence };
}

/**
 * Hosted vision reader for any OpenAI-compatible chat-completions endpoint. It is an optional
 * upgrade: on ANY failure (network, timeout, HTTP error, bad JSON, schema mismatch) it falls back
 * to the local reader so the feature keeps working.
 */
@Injectable()
export class OpenAICompatibleVisionLabelReaderProvider implements LabelReaderProvider {
  readonly external = true;
  private readonly logger = new Logger(OpenAICompatibleVisionLabelReaderProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fallback: LabelReaderProvider,
    private readonly deps: { fetchImpl?: VisionFetch; imageFetch?: FetchLike } = {},
  ) {}

  async read(input: LabelReadInput): Promise<LabelReadResult> {
    const baseUrl = this.config.get<string>('labelVisionBaseUrl', '');
    const apiKey = this.config.get<string>('labelVisionApiKey', '');
    const model = this.config.get<string>('labelVisionModel', '');
    if (!baseUrl || !apiKey || !model) return this.fallback.read(input);
    try {
      const image = await preprocessForVision(
        await downloadLabelImage(input.imageUrl, this.deps.imageFetch),
      );
      const fetchImpl = this.deps.fetchImpl ?? fetch;
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: VISION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Read this pesticide label and return the JSON object.' },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty content');
      const parsed = parseVisionLabelJson(content);
      if (!parsed) throw new Error('schema mismatch');
      // Fields the model skipped but the text contains are filled by the deterministic extractor.
      const fields: ExtractedLabelFields = {
        ...extractLabelFields(parsed.rawText),
        ...parsed.fields,
      };
      return {
        rawText: parsed.rawText,
        fields,
        confidence: parsed.confidence,
        provider: 'openai-compatible',
        model,
      };
    } catch (error) {
      this.logger.warn(
        `Vision label reader failed, using local OCR: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.fallback.read(input);
    }
  }
}
