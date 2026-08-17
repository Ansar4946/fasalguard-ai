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
@Injectable()
export class StressAnalysisClient {
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    this.baseUrl = config
      .get<string>('geospatialAiUrl', 'http://localhost:8000')
      .replace(/\/$/, '');
  }
  async analyse(payload: Record<string, unknown>): Promise<StressZoneResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/stress-analysis`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as { zones: StressZoneResult[] };
      return result.zones;
    } catch {
      throw new ServiceUnavailableException({
        code: 'STRESS_ANALYSIS_UNAVAILABLE',
        message: 'Satellite stress analysis service is unavailable.',
      });
    }
  }
}
