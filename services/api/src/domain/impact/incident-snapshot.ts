import type { DataSource } from 'typeorm';

export interface FieldOutcomeSnapshot {
  vegetationScore: number | null;
  affectedAreaHectares: number | null;
}

/**
 * Real, evidence-derived "how is this field doing right now" snapshot — used both when an
 * incident is first created (initial_*) and when a follow-up is recorded (follow_up_*), so the
 * two numbers are computed identically and are honestly comparable. Returns null for a metric
 * when there is genuinely no underlying evidence yet (no satellite capture, no health score) —
 * never a fabricated placeholder.
 */
export async function captureFieldSnapshot(
  db: DataSource,
  fieldId: string | null | undefined,
): Promise<FieldOutcomeSnapshot> {
  if (!fieldId) return { vegetationScore: null, affectedAreaHectares: null };

  const health: Array<{ score: number }> = await db.query(
    `SELECT score FROM field_health_scores WHERE field_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [fieldId],
  );

  const latestCapture: Array<{ id: string }> = await db.query(
    `SELECT id FROM satellite_captures WHERE field_id=$1 AND processing_status='COMPLETED'
     ORDER BY COALESCE(acquisition_date,created_at) DESC LIMIT 1`,
    [fieldId],
  );
  let affectedAreaHectares: number | null = null;
  if (latestCapture[0]) {
    const area: Array<{ hectares: string | null }> = await db.query(
      `SELECT COALESCE(SUM(ST_Area(geometry::geography)),0)/10000 hectares FROM satellite_stress_zones WHERE capture_id=$1`,
      [latestCapture[0].id],
    );
    affectedAreaHectares = area[0] ? Number(area[0].hectares) : 0;
  }

  return {
    vegetationScore: health[0]?.score ?? null,
    affectedAreaHectares,
  };
}
