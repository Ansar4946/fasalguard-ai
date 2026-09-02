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
    const model = this.config.get<string>('roboflowModelId', '');
    const version = this.config.get<string>('roboflowModelVersion', '');
    if (!this.config.get<string>('roboflowApiKey', '') || !model || !version)
      throw new Error('Roboflow provider selected without credentials and model configuration.');
    const responses = await Promise.all(inputs.map((input) => this.infer(input, model, version)));
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
      modelId: model,
      modelVersion: version,
      predictedCondition: top.condition,
      confidence: top.confidence,
      alternatives: aggregated
        .slice(1, 4)
        .map(({ condition, confidence }) => ({ condition, confidence })),
      inferenceTimestamp: new Date().toISOString(),
      rawProviderResponse: {
        task: this.config.get<string>('roboflowModelTask', 'classification'),
        imageCount: inputs.length,
        perImage: responses,
        aggregation: aggregated,
      },
    };
  }

  private async infer(
    input: VisionInput,
    model: string,
    version: string,
  ): Promise<RoboflowResponse> {
    const key = this.config.getOrThrow<string>('roboflowApiKey');
    const task = this.config.get<string>('roboflowModelTask', 'classification');
    const configuredBase = this.config.get<string>(
      'roboflowBaseUrl',
      'https://detect.roboflow.com',
    );
    const base =
      task === 'classification' && configuredBase === 'https://detect.roboflow.com'
        ? 'https://classify.roboflow.com'
        : configuredBase;
    const url = new URL(`/${encodeURIComponent(model)}/${encodeURIComponent(version)}`, base);
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
