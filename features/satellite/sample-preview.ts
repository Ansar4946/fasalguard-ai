/**
 * SAMPLE PREVIEW fallback for the satellite page.
 *
 * Every number produced here is SYNTHETIC. It is NOT a measurement of any field. It exists only so the
 * page layout can be previewed when real satellite data is unavailable. The only thing taken from the
 * real world is the field's own boundary (used so the map renders on the real field).
 *
 * Honesty guard: sample objects carry `source: "SAMPLE"` and real ones `source: "REAL"`. Any code path that
 * persists, exports, alerts on, or returns data must accept `RealSatelliteData` only and call
 * `assertRealSatelliteData()`. Sample objects must never be written to the DB, local/session storage,
 * exports/reports, alerts/tasks, the dashboard or any API response.
 */
import type { GeoJsonPolygon } from "@/lib/geo/polygon";
import type { Comparison, Evidence, LayerItem, Scan, StatisticEntry, StressZone } from "./types";

export type SampleReason = "CLOUD_BLOCKED" | "NO_VALID_SCENE" | "FAILED" | "NONE" | "LOAD_ERROR";

export interface RealSatelliteData {
  source: "REAL";
  scan: Scan;
  layers: LayerItem[];
  statistics: StatisticEntry[];
  zones: StressZone[];
  evidence: Evidence | null;
  comparison: Comparison | null;
}

export interface SampleSatelliteData {
  source: "SAMPLE";
  reason: SampleReason;
  reasonText: string;
  fieldId: string;
  /** SYNTHETIC. */
  cloudCoverage: number;
  /** SYNTHETIC. */
  usablePixelPercentage: number;
  statistics: StatisticEntry[];
  zones: StressZone[];
  comparison: Comparison;
}

export type SatelliteData = RealSatelliteData | SampleSatelliteData;

/** Throws for sample data. Call at the entry of every persist/export/alert/task/dashboard/API path. */
export function assertRealSatelliteData(data: SatelliteData): asserts data is RealSatelliteData {
  if (data.source !== "REAL") throw new Error("Sample satellite data must never be persisted, exported, alerted on or returned by an API.");
}

export const SAMPLE_REASON_TEXT: Record<SampleReason, string> = {
  CLOUD_BLOCKED: "the latest satellite images were too cloudy to analyse",
  NO_VALID_SCENE: "no cloud-free satellite image was found for the requested dates",
  FAILED: "the latest satellite scan failed",
  NONE: "no satellite scan has been run for this field yet",
  LOAD_ERROR: "satellite data could not be loaded",
};

type Ring = number[][];

function ringsOf(boundary: GeoJsonPolygon): Ring[] {
  return boundary.coordinates.filter((ring) => ring.length >= 4);
}

function pointInRings(x: number, y: number, rings: Ring[]): boolean {
  let inside = false; // even-odd rule across outer ring and holes
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** True when segments touch or cross (inclusive). */
function segmentsMeet(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  const o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]);
  const o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  const on = (p: number[], q: number[], r: number[]) =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
}

/** True when `inner` (outer ring) lies fully inside `boundary`: all vertices inside and no edge touches a boundary edge. */
export function isPolygonInsideBoundary(inner: GeoJsonPolygon, boundary: GeoJsonPolygon): boolean {
  const rings = ringsOf(boundary);
  const innerRing = inner.coordinates[0] ?? [];
  if (rings.length === 0 || innerRing.length < 4) return false;
  if (!innerRing.every(([x, y]) => pointInRings(x, y, rings))) return false;
  for (let i = 0; i < innerRing.length - 1; i++)
    for (const ring of rings)
      for (let j = 0; j < ring.length - 1; j++)
        if (segmentsMeet(innerRing[i], innerRing[i + 1], ring[j], ring[j + 1])) return false;
  return true;
}

function ringAreaHectares(ring: Ring): number {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) twice += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(twice) / 2 / 10000;
}

function squareAt(cx: number, cy: number, halfLng: number, halfLat: number): GeoJsonPolygon {
  return {
    type: "Polygon",
    coordinates: [[[cx - halfLng, cy - halfLat], [cx + halfLng, cy - halfLat], [cx + halfLng, cy + halfLat], [cx - halfLng, cy + halfLat], [cx - halfLng, cy - halfLat]]],
  };
}

/**
 * Small square polygons placed deterministically inside the field's own boundary.
 * Returns fewer than `count` (possibly none) if the geometry has no room; never returns a polygon outside.
 */
export function deriveZonePolygons(boundary: GeoJsonPolygon, count = 3): GeoJsonPolygon[] {
  const rings = ringsOf(boundary);
  if (rings.length === 0) return [];
  const pts = rings[0];
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const minX = Math.min(...lngs), maxX = Math.max(...lngs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const cosLat = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const widthM = (maxX - minX) * 111320 * cosLat;
  const heightM = (maxY - minY) * 110540;
  if (!(widthM > 0) || !(heightM > 0)) return [];
  // Fixed fractional targets inside the bounding box keep the result deterministic.
  const targets: Array<[number, number]> = [[0.3, 0.35], [0.7, 0.5], [0.45, 0.78], [0.2, 0.7], [0.8, 0.25]];
  const grid = 17;
  for (const shrink of [1, 0.7, 0.5, 0.35, 0.2]) {
    const sideM = 0.14 * Math.min(widthM, heightM) * shrink;
    const halfLat = sideM / 2 / 110540;
    const halfLng = sideM / 2 / (111320 * cosLat);
    const candidates: Array<{ x: number; y: number; poly: GeoJsonPolygon }> = [];
    for (let r = 1; r < grid; r++)
      for (let c = 1; c < grid; c++) {
        const x = minX + ((maxX - minX) * c) / grid;
        const y = minY + ((maxY - minY) * r) / grid;
        const poly = squareAt(x, y, halfLng, halfLat);
        if (isPolygonInsideBoundary(poly, boundary)) candidates.push({ x, y, poly });
      }
    const chosen: typeof candidates = [];
    for (const [fx, fy] of targets) {
      if (chosen.length >= count) break;
      const tx = minX + (maxX - minX) * fx, ty = minY + (maxY - minY) * fy;
      let best: (typeof candidates)[number] | null = null, bestD = Infinity;
      for (const cand of candidates) {
        if (chosen.some((o) => Math.abs(o.x - cand.x) < halfLng * 3 && Math.abs(o.y - cand.y) < halfLat * 3)) continue;
        const d = ((cand.x - tx) / (maxX - minX)) ** 2 + ((cand.y - ty) / (maxY - minY)) ** 2;
        if (d < bestD) { bestD = d; best = cand; }
      }
      if (best) chosen.push(best);
    }
    if (chosen.length >= Math.min(count, 2) || shrink === 0.2) return chosen.map((c) => c.poly);
  }
  return [];
}

const DAY_MS = 86400000;

/**
 * Builds the deterministic sample dataset for a field. ALL numbers below are SYNTHETIC illustrations.
 * `referenceDate` only anchors the placeholder comparison dates (tests pass a fixed value).
 */
export function buildSamplePreview(
  input: { fieldId: string; boundary: GeoJsonPolygon; reason: SampleReason },
  referenceDate: Date = new Date(),
): SampleSatelliteData {
  const ref = referenceDate.getTime();
  const createdAt = new Date(ref).toISOString();
  const polygons = deriveZonePolygons(input.boundary, 3);
  // SYNTHETIC severity/score per zone slot; area is computed from the derived polygon only.
  const slots: Array<{ severity: StressZone["severity"]; score: number }> = [
    { severity: "HIGH", score: 74 }, { severity: "MODERATE", score: 58 }, { severity: "LOW", score: 41 },
  ];
  const zones: StressZone[] = polygons.map((geometry, i) => ({
    id: `sample-zone-${i + 1}`,
    label: `SAMPLE_ZONE_${i + 1}`,
    severity: slots[i].severity,
    score: slots[i].score,
    areaHectares: ringAreaHectares(geometry.coordinates[0]),
    geometry,
    evidence: {},
    createdAt,
  }));
  // SYNTHETIC statistics (illustrative only).
  const stat = (index: StatisticEntry["index"], mean: number): StatisticEntry => ({
    index,
    statistics: { mean, validPixelPercentage: 86, maskedCloudPercentage: 9, maskedPixelPercentage: 14 },
  });
  // SYNTHETIC trend, oldest first.
  const trend = [
    { ndvi: 0.49, evi: 0.33, ndwi: -0.36, ndmi: 0.12, health: 66 },
    { ndvi: 0.53, evi: 0.36, ndwi: -0.34, ndmi: 0.15, health: 70 },
    { ndvi: 0.56, evi: 0.39, ndwi: -0.32, ndmi: 0.17, health: 73 },
    { ndvi: 0.58, evi: 0.41, ndwi: -0.31, ndmi: 0.19, health: 75 },
  ];
  return {
    source: "SAMPLE",
    reason: input.reason,
    reasonText: SAMPLE_REASON_TEXT[input.reason],
    fieldId: input.fieldId,
    cloudCoverage: 9, // SYNTHETIC
    usablePixelPercentage: 86, // SYNTHETIC
    statistics: [stat("NDVI", 0.58), stat("EVI", 0.41), stat("NDWI", -0.31), stat("NDMI", 0.19)],
    zones,
    comparison: {
      fieldId: input.fieldId,
      comparisonBasis: "PREVIOUS_VALID_OBSERVATION",
      observations: trend.map((t, i) => ({
        captureId: `sample-observation-${i + 1}`,
        acquisitionDate: new Date(ref - (trend.length - 1 - i) * 10 * DAY_MS).toISOString(),
        healthScore: t.health,
        statistics: { NDVI: { mean: t.ndvi }, EVI: { mean: t.evi }, NDWI: { mean: t.ndwi }, NDMI: { mean: t.ndmi } },
      })),
    },
  };
}
