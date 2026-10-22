import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { type RowError, validateYieldCsv } from './yield-csv';

export interface YieldImportResult {
  ok: boolean;
  batchId: string | null;
  inserted: number;
  unchanged: number;
  errors: RowError[];
}

@Injectable()
export class YieldImportService {
  constructor(private readonly db: DataSource) {}

  /** All-or-nothing: any invalid row, or any row that conflicts with an already stored different
   *  value, rejects the whole file. Re-importing an identical file inserts nothing. Existing
   *  observations are never overwritten. */
  async importCsv(csv: string, createdBy: string): Promise<YieldImportResult> {
    const who = createdBy.trim();
    if (!who) throw new Error('createdBy is required.');
    const { rows, errors } = validateYieldCsv(csv);
    if (errors.length) return { ok: false, batchId: null, inserted: 0, unchanged: 0, errors };
    if (!rows.length)
      return {
        ok: false,
        batchId: null,
        inserted: 0,
        unchanged: 0,
        errors: [{ line: 0, message: 'CSV has no data rows.' }],
      };
    const batchId = randomUUID();
    const runner = this.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const conflicts: RowError[] = [];
      let inserted = 0;
      let unchanged = 0;
      for (const r of rows) {
        const found = (await runner.query(
          `SELECT yield_kg_per_ha::text y FROM yield_observations
            WHERE crop=$1 AND district=$2 AND season=$3 AND year=$4`,
          [r.crop, r.district, r.season, r.year],
        )) as Array<{ y: string }>;
        const existing = found[0];
        if (existing) {
          if (Number(existing.y) === r.yieldKgPerHa) unchanged++;
          else
            conflicts.push({
              line: r.line,
              message: `A different value (${existing.y} kg/ha) is already stored for this crop, district, season and year; observations are never overwritten.`,
            });
          continue;
        }
        await runner.query(
          `INSERT INTO yield_observations(crop,province,district,season,year,published_value,published_unit,
             yield_kg_per_ha,source_name,source_url,licence_status,import_batch_id,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            r.crop,
            r.province,
            r.district,
            r.season,
            r.year,
            r.publishedValue,
            r.publishedUnit,
            r.yieldKgPerHa,
            r.sourceName,
            r.sourceUrl,
            r.licenceStatus,
            batchId,
            who,
          ],
        );
        inserted++;
      }
      if (conflicts.length) {
        await runner.rollbackTransaction();
        return { ok: false, batchId: null, inserted: 0, unchanged: 0, errors: conflicts };
      }
      if (inserted > 0) await this.recomputeStatistics(runner);
      await runner.commitTransaction();
      return { ok: true, batchId: inserted ? batchId : null, inserted, unchanged, errors: [] };
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
  }

  private async recomputeStatistics(runner: QueryRunner): Promise<void> {
    await runner.query(`DELETE FROM yield_reference_statistics`);
    await runner.query(
      `INSERT INTO yield_reference_statistics(crop,district,season,n,min_kg_per_ha,p25_kg_per_ha,median_kg_per_ha,
          p75_kg_per_ha,max_kg_per_ha,years_covered,source_names,source_urls,licence_statuses)
       SELECT crop,district,season,count(*)::int,min(yield_kg_per_ha),
              percentile_cont(0.25) WITHIN GROUP (ORDER BY yield_kg_per_ha),
              percentile_cont(0.5) WITHIN GROUP (ORDER BY yield_kg_per_ha),
              percentile_cont(0.75) WITHIN GROUP (ORDER BY yield_kg_per_ha),
              max(yield_kg_per_ha),array_agg(year ORDER BY year),
              array_agg(DISTINCT source_name),array_agg(DISTINCT source_url),array_agg(DISTINCT licence_status)
         FROM yield_observations GROUP BY crop,district,season`,
    );
  }
}
