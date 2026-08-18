import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Polygon } from 'geojson';
export interface StressZoneResult {
  label:
    | 'VEGETATION_DECLINE'
    | 'POSSIBLE_WATER_STRESS'
    | 'POSSIBLE_EXCESS_MOISTURE'
    | 'UNEVEN_GROWTH'
    | 'UNKNOWN_STRESS';
  severity: 'LOW' | 'MODERATE' | 'HIGH';
  score: number;
  areaHectares: number;
  geometry: Polygon;
  evidence: Record<string, number>;
}
export interface StressAnalysisResult {
  methodology: 'FIELD_TEMPORAL_BASELINE';
  baseline: {
    method: 'ROLLING_FIELD_BASELINE' | 'PREVIOUS_VALID_OBSERVATION' | 'INSUFFICIENT_HISTORY';
    captureIds: string[];
    observationCount: number;
  };
  zones: StressZoneResult[];
}
const allowedLabels = new Set<StressZoneResult['label']>([
  'VEGETATION_DECLINE',
  'POSSIBLE_WATER_STRESS',
  'POSSIBLE_EXCESS_MOISTURE',
  'UNEVEN_GROWTH',
  'UNKNOWN_STRESS',
]);
@Injectable()
export class StressAnalysisClient {
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('geospatialAiUrl', 'http://localhost:8000')
      .replace(/\/$/, '');
  }
  async analyse(payload: Record<string, unknown>): Promise<StressAnalysisResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/stress-analysis`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as StressAnalysisResult;
      if (
        result.methodology !== 'FIELD_TEMPORAL_BASELINE' ||
        !result.baseline ||
        !Array.isArray(result.baseline.captureIds) ||
        !Array.isArray(result.zones) ||
        result.zones.some((zone) => !allowedLabels.has(zone.label))
      )
        throw new Error('Invalid non-diagnostic satellite analysis response');
      return result;
    } catch {
      throw new ServiceUnavailableException({
        code: 'STRESS_ANALYSIS_UNAVAILABLE',
        message: 'Satellite stress analysis service is unavailable.',
      });
    }
  }
}
