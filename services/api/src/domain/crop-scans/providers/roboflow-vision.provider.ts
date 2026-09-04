import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  VisionDiagnosisProvider,
  VisionInput,
  VisionPrediction,
  VisionQuality,
} from './vision-diagnosis.provider';

interface RoboflowPrediction {
  class?: string;
  class_name?: string;
  confidence?: number;
}
interface RoboflowResponse {
  predictions?: RoboflowPrediction[] | Record<string, { confidence?: number }>;
  top?: string;
  confidence?: number;
  prediction_type?: string;
}
interface AggregatedClass {
  condition: string;
  confidence: number;
  supportingImages: number;
}
interface RoboflowModelConfig {
  model: string;
  version: string;
  task: 'classification' | 'detection';
}

@Injectable()
export class RoboflowVisionProvider implements VisionDiagnosisProvider {
  constructor(private readonly config: ConfigService) {}

  async assessQuality(input: VisionInput): Promise<VisionQuality> {
    const { default: sharp } = await import('sharp');
    const sample = await sharp(input.image)
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = sample.data;
    const mean = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
    let variance = 0;
    for (const value of pixels) variance += (value - mean) ** 2;
    variance /= Math.max(1, pixels.length);
    const darkRatio = pixels.filter((value) => value <= 18).length / Math.max(1, pixels.length);
    const brightRatio = pixels.filter((value) => value >= 245).length / Math.max(1, pixels.length);
    const issues: Array<{ code: string; score?: number }> = [];
    if (mean < 38 || darkRatio > 0.65) issues.push({ code: 'TOO_DARK', score: round(mean / 255) });
    if (mean > 225 || brightRatio > 0.65)
      issues.push({ code: 'OVEREXPOSED', score: round(brightRatio) });
    if (variance < 115) issues.push({ code: 'POSSIBLY_BLURRY', score: round(variance) });
    return {
      acceptable: issues.length === 0,
      issues,
      metadata: {
        method: 'LOCAL_PIXEL_QUALITY_V1',
        brightnessMean: round(mean),
        grayscaleVariance: round(variance),
        darkRatio: round(darkRatio),
        brightRatio: round(brightRatio),
      },
    };
  }

  async predict(inputs: VisionInput[]): Promise<VisionPrediction> {
    if (!inputs.length) throw new Error('At least one image is required for vision screening.');
    const cropNames = new Set(
      inputs.map((input) => normalizeCropName(input.cropName)).filter(Boolean),
    );
    if (cropNames.size > 1) throw new Error('CROP_CONTEXT_MISMATCH');
    const cropName = [...cropNames][0] ?? '';
    const selected = this.modelForCrop(cropName);
    if (!this.config.get<string>('roboflowApiKey', '') || !selected.model || !selected.version)
      throw new Error('Roboflow provider selected without credentials and model configuration.');
    const responses = await Promise.all(inputs.map((input) => this.infer(input, selected)));
    const totals = new Map<string, { confidence: number; supportingImages: number }>();
    for (const response of responses) {
      for (const prediction of normalizePredictions(response)) {
        const current = totals.get(prediction.condition) ?? {
          confidence: 0,
          supportingImages: 0,
        };
        current.confidence += prediction.confidence;
        current.supportingImages += 1;
        totals.set(prediction.condition, current);
      }
    }
    const aggregated: AggregatedClass[] = [...totals.entries()]
      .map(([condition, value]) => ({
        condition,
        confidence: value.confidence / inputs.length,
        supportingImages: value.supportingImages,
      }))
      .sort((a, b) => b.confidence - a.confidence);
    const top = aggregated[0];
    if (!top) throw new Error('Vision provider returned no usable prediction.');
    return {
      modelId: selected.model,
      modelVersion: selected.version,
      predictedCondition: top.condition,
      confidence: top.confidence,
      alternatives: aggregated
        .slice(1, 4)
        .map(({ condition, confidence }) => ({ condition, confidence })),
      inferenceTimestamp: new Date().toISOString(),
      rawProviderResponse: {
        task: selected.task,
        cropName: cropName || null,
        imageCount: inputs.length,
        perImage: responses,
        aggregation: aggregated,
      },
    };
  }

  private async infer(
    input: VisionInput,
    selected: RoboflowModelConfig,
  ): Promise<RoboflowResponse> {
    const key = this.config.getOrThrow<string>('roboflowApiKey');
    const configuredBase = this.config.get<string>(
      'roboflowBaseUrl',
      'https://detect.roboflow.com',
    );
    const base =
      selected.task === 'classification' && configuredBase === 'https://detect.roboflow.com'
        ? 'https://classify.roboflow.com'
        : configuredBase;
    const url = new URL(
      `/${encodeURIComponent(selected.model)}/${encodeURIComponent(selected.version)}`,
      base,
    );
    url.searchParams.set('api_key', key);
    url.searchParams.set('format', 'json');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: input.image.toString('base64'),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Vision provider request failed (${response.status}).`);
    return (await response.json()) as RoboflowResponse;
  }

  private modelForCrop(cropName: string): RoboflowModelConfig {
    if (cropName === 'wheat') {
      const wheat = {
        model: this.config.get<string>('roboflowWheatModelId', ''),
        version: this.config.get<string>('roboflowWheatModelVersion', ''),
        task: this.config.get<'classification' | 'detection'>(
          'roboflowWheatModelTask',
          'classification',
        ),
      };
      if (!wheat.model || !wheat.version) throw new Error('WHEAT_VISION_MODEL_NOT_CONFIGURED');
      return wheat;
    }
    if (cropName === 'rice') {
      const rice = {
        model: this.config.get<string>('roboflowRiceModelId', ''),
        version: this.config.get<string>('roboflowRiceModelVersion', ''),
        task: this.config.get<'classification' | 'detection'>(
          'roboflowRiceModelTask',
          'classification',
        ),
      };
      if (!rice.model || !rice.version) throw new Error('RICE_VISION_MODEL_NOT_CONFIGURED');
      return rice;
    }
    return {
      model: this.config.get<string>('roboflowModelId', ''),
      version: this.config.get<string>('roboflowModelVersion', ''),
      task: this.config.get<'classification' | 'detection'>('roboflowModelTask', 'classification'),
    };
  }
}

function normalizeCropName(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('en');
}

function normalizePredictions(
  response: RoboflowResponse,
): Array<{ condition: string; confidence: number }> {
  const values = new Map<string, number>();
  const add = (condition: string, confidence: number): void => {
    // Detection can return several boxes for one condition in the same image. Use the strongest
    // box rather than summing boxes into an impossible confidence greater than one.
    values.set(condition, Math.max(values.get(condition) ?? 0, confidence));
  };
  if (Array.isArray(response.predictions)) {
    for (const prediction of response.predictions) {
      const condition = prediction.class ?? prediction.class_name;
      if (condition && validConfidence(prediction.confidence))
        add(condition, prediction.confidence);
    }
  } else if (response.predictions && typeof response.predictions === 'object') {
    for (const [condition, prediction] of Object.entries(response.predictions))
      if (validConfidence(prediction.confidence)) add(condition, prediction.confidence);
  }
  if (!values.size && response.top && validConfidence(response.confidence))
    add(response.top, response.confidence);
  return [...values.entries()]
    .map(([condition, confidence]) => ({ condition, confidence }))
    .sort((a, b) => b.confidence - a.confidence);
}
function validConfidence(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
