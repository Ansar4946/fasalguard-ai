import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  VisionDiagnosisProvider,
  VisionInput,
  VisionPrediction,
  VisionQuality,
} from './vision-diagnosis.provider';
interface RoboflowResponse {
  predictions?: Array<{ class?: string; confidence?: number }>;
}
@Injectable()
export class RoboflowVisionProvider implements VisionDiagnosisProvider {
  constructor(private readonly config: ConfigService) {}
  assessQuality(input: VisionInput): Promise<VisionQuality> {
    void input;
    return Promise.resolve({
      acceptable: true,
      issues: [],
      metadata: { providerQualityModel: false },
    });
  }
  async predict(inputs: VisionInput[]): Promise<VisionPrediction> {
    const key = this.config.get<string>('roboflowApiKey', '');
    const model = this.config.get<string>('roboflowModelId', '');
    const version = this.config.get<string>('roboflowModelVersion', '');
    if (!key || !model || !version)
      throw new Error('Roboflow provider selected without credentials and model configuration.');
    const url = new URL(
      `/${model}/${version}`,
      this.config.get<string>('roboflowBaseUrl', 'https://detect.roboflow.com'),
    );
    url.searchParams.set('api_key', key);
    const first = inputs[0];
    if (!first) throw new Error('At least one image is required for vision screening.');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': first.contentType },
      body: new Blob([new Uint8Array(first.image)], { type: first.contentType }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('Vision provider request failed.');
    const raw = (await response.json()) as RoboflowResponse;
    const sorted = [...(raw.predictions ?? [])]
      .filter((x) => typeof x.class === 'string' && typeof x.confidence === 'number')
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    const top = sorted[0];
    if (!top?.class || typeof top.confidence !== 'number')
      throw new Error('Vision provider returned no usable prediction.');
    return {
      modelId: model,
      modelVersion: version,
      predictedCondition: top.class,
      confidence: top.confidence,
      alternatives: sorted
        .slice(1, 4)
        .map((x) => ({ condition: x.class!, confidence: x.confidence! })),
      inferenceTimestamp: new Date().toISOString(),
      rawProviderResponse: raw as Record<string, unknown>,
    };
  }
}
