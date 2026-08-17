import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  VisionDiagnosisProvider,
  VisionInput,
  VisionPrediction,
  VisionQuality,
} from './vision-diagnosis.provider';
@Injectable()
export class SelfHostedVisionProvider implements VisionDiagnosisProvider {
  constructor(private readonly config: ConfigService) {}
  private async call<T>(path: string, payload: unknown): Promise<T> {
    const response = await fetch(
      new URL(path, this.config.get<string>('selfHostedVisionUrl', 'http://localhost:8000')),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error('Self-hosted vision service request failed.');
    return response.json() as Promise<T>;
  }
  assessQuality(input: VisionInput): Promise<VisionQuality> {
    return this.call('/v1/vision/quality', {
      imageBase64: input.image.toString('base64'),
      contentType: input.contentType,
      category: input.category,
    });
  }
  predict(inputs: VisionInput[]): Promise<VisionPrediction> {
    return this.call('/v1/vision/predict', {
      images: inputs.map((x) => ({
        imageBase64: x.image.toString('base64'),
        contentType: x.contentType,
        category: x.category,
      })),
    });
  }
}
