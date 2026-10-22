import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MIN_YEARS_FOR_REFERENCE, PREDICTION_UNAVAILABLE_REASON } from './yield-reference';

interface StatRow {
  season: string;
  n: number;
  min: string;
  p25: string;
  median: string;
  p75: string;
  max: string;
  years: number[];
  sources: string[];
  urls: string[];
  licences: string[];
}

@Injectable()
export class YieldService {
  constructor(private readonly db: DataSource) {}

  /** Historical ranges only. Seasons with fewer than MIN_YEARS_FOR_REFERENCE years expose no range. */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the inferred literal types are the API contract
  async reference(crop: string, district: string) {
    const rows = await this.db.query<StatRow[]>(
      `SELECT season,n,min_kg_per_ha::text "min",p25_kg_per_ha::text p25,median_kg_per_ha::text median,
              p75_kg_per_ha::text p75,max_kg_per_ha::text "max",years_covered years,
              source_names sources,source_urls urls,licence_statuses licences
         FROM yield_reference_statistics WHERE crop=$1 AND district=$2 ORDER BY season`,
      [crop, district],
    );
    const seasons = rows.map((r) =>
      r.n < MIN_YEARS_FOR_REFERENCE
        ? {
            season: r.season,
            status: 'insufficient_data' as const,
            n: r.n,
            minimumYears: MIN_YEARS_FOR_REFERENCE,
            yearsCovered: r.years,
          }
        : {
            season: r.season,
            status: 'reference_available' as const,
            n: r.n,
            unit: 'kg/ha',
            minKgPerHa: Number(r.min),
            p25KgPerHa: Number(r.p25),
            medianKgPerHa: Number(r.median),
            p75KgPerHa: Number(r.p75),
            maxKgPerHa: Number(r.max),
            yearsCovered: r.years,
            provenance: {
              sourceNames: r.sources,
              sourceUrls: r.urls,
              licenceStatuses: r.licences,
              licenceNote: r.licences.includes('UNVERIFIED')
                ? 'Licence for at least one source is unverified; treat as an internal reference only.'
                : null,
            },
          },
    );
    const available = seasons.some((s) => s.status === 'reference_available');
    return {
      crop,
      district,
      status: available ? ('reference_available' as const) : ('insufficient_data' as const),
      minimumYears: MIN_YEARS_FOR_REFERENCE,
      seasons,
      predictionAvailable: false as const,
      predictionReason: PREDICTION_UNAVAILABLE_REASON,
    };
  }
}
