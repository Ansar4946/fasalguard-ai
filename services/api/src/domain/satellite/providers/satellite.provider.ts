import type { Polygon } from 'geojson';
export const SATELLITE_PROVIDER = Symbol('SATELLITE_PROVIDER');
export interface CatalogScene {
  id: string;
  satellite: string;
  acquiredAt: Date;
  cloudCoverage: number;
  rawMetadata: Record<string, unknown>;
}
export interface CatalogSearch {
  polygon: Polygon;
  from: Date;
  to: Date;
  maxCloudCoverage: number;
  limit?: number;
}
export interface SatelliteProvider {
  searchCatalog(input: CatalogSearch): Promise<CatalogScene[]>;
  process<T = unknown>(payload: Record<string, unknown>): Promise<T>;
  statistics<T = unknown>(payload: Record<string, unknown>): Promise<T>;
  render(payload: Record<string, unknown>): Promise<{ body: Buffer; contentType: string }>;
}
export class SatelliteProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}
