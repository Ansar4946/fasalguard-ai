// Run with: node --test tests/satellite/sample-preview.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Minimal TypeScript loader (relative imports only; `import type` is erased).
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = (request) => (request.startsWith('.') ? load(path.resolve(path.dirname(filename), request.endsWith('.ts') ? request : request + '.ts')) : require(request));
  cache.set(filename, mod);
  mod._compile(out.outputText, filename);
  return mod.exports;
}
const root = path.resolve(__dirname, '../../features/satellite');
const { selectDisplaySource, STALE_AFTER_DAYS } = load(path.join(root, 'display-source.ts'));
const { buildSamplePreview, assertRealSatelliteData, isPolygonInsideBoundary, SAMPLE_REASON_TEXT } = load(path.join(root, 'sample-preview.ts'));

const NOW = new Date('2026-10-16T08:00:00Z');
const scan = (id, processingStatus, extra = {}) => ({ id, fieldId: 'f1', processingStatus, acquisitionDate: null, cloudCoverage: null, usablePixelPercentage: null, dataQuality: 'UNKNOWN', createdAt: '2026-10-15T00:00:00Z', ...extra });
const done = (id, date) => scan(id, 'COMPLETED', { acquisitionDate: date, dataQuality: 'GOOD' });

// Field near Rangeelpur: a plain rectangle, and a concave L shape.
const rect = { type: 'Polygon', coordinates: [[[72.5, 31.5], [72.504, 31.5], [72.504, 31.503], [72.5, 31.503], [72.5, 31.5]]] };
const ell = { type: 'Polygon', coordinates: [[[72.5, 31.5], [72.505, 31.5], [72.505, 31.502], [72.502, 31.502], [72.502, 31.505], [72.5, 31.505], [72.5, 31.5]]] };

test('real COMPLETED capture is selected over sample, even when old', () => {
  const s = selectDisplaySource({ scans: [scan('n', 'FAILED'), done('old', '2025-01-09T06:00:00Z')], now: NOW });
  assert.equal(s.kind, 'REAL');
  assert.equal(s.scan.id, 'old');
  assert.equal(s.stale, true);
  assert.ok(s.ageDays > STALE_AFTER_DAYS);
});

test('sample is never selected when a COMPLETED real capture exists, whatever else is listed or picked', () => {
  for (const status of ['FAILED', 'CLOUD_BLOCKED', 'NO_VALID_SCENE']) {
    const scans = [scan('bad', status), done('good', '2026-10-10T00:00:00Z')];
    for (const picked of [undefined, 'bad', 'good', 'missing']) {
      const s = selectDisplaySource({ scans, pickedScanId: picked, now: NOW });
      assert.equal(s.kind, 'REAL', `${status}/${picked}`);
      assert.equal(s.scan.id, 'good');
      assert.equal(s.stale, false);
    }
  }
});

test('fresh real capture is not flagged stale', () => {
  const s = selectDisplaySource({ scans: [done('a', '2026-10-12T00:00:00Z')], now: NOW });
  assert.equal(s.kind, 'REAL');
  assert.equal(s.stale, false);
  assert.equal(s.ageDays, 4);
});

test('in-progress real scans show real progress, never the sample', () => {
  for (const status of ['QUEUED', 'SEARCHING_SCENE', 'PROCESSING', 'ANALYSING']) {
    const s = selectDisplaySource({ scans: [scan('p', status)], now: NOW });
    assert.equal(s.kind, 'REAL_IN_PROGRESS');
  }
  // user just requested a new scan while an old failed one exists
  const s = selectDisplaySource({ scans: [scan('p', 'QUEUED'), scan('x', 'CLOUD_BLOCKED')], pickedScanId: 'p', now: NOW });
  assert.equal(s.kind, 'REAL_IN_PROGRESS');
});

test('sample reason per failure status and for no scan / load error', () => {
  const cases = [
    [[scan('a', 'FAILED')], 'FAILED'],
    [[scan('a', 'CLOUD_BLOCKED')], 'CLOUD_BLOCKED'],
    [[scan('a', 'NO_VALID_SCENE')], 'NO_VALID_SCENE'],
    [[], 'NONE'],
  ];
  for (const [scans, reason] of cases) {
    const s = selectDisplaySource({ scans, now: NOW });
    assert.equal(s.kind, 'SAMPLE');
    assert.equal(s.reason, reason);
    const sample = buildSamplePreview({ fieldId: 'f1', boundary: rect, reason: s.reason }, NOW);
    assert.equal(sample.reasonText, SAMPLE_REASON_TEXT[reason]);
    assert.ok(sample.reasonText.length > 10);
  }
  assert.equal(selectDisplaySource({ scans: [], loadFailed: true, now: NOW }).reason, 'LOAD_ERROR');
  assert.match(SAMPLE_REASON_TEXT.CLOUD_BLOCKED, /cloudy/);
  assert.match(SAMPLE_REASON_TEXT.FAILED, /failed/);
  assert.match(SAMPLE_REASON_TEXT.NO_VALID_SCENE, /cloud-free/);
  assert.match(SAMPLE_REASON_TEXT.NONE, /no satellite scan/);
});

test('sample objects carry source SAMPLE and are rejected by the real-only guard', () => {
  const sample = buildSamplePreview({ fieldId: 'f1', boundary: rect, reason: 'FAILED' }, NOW);
  assert.equal(sample.source, 'SAMPLE');
  assert.throws(() => assertRealSatelliteData(sample), /Sample satellite data/);
  const real = { source: 'REAL', scan: done('a', '2026-10-12T00:00:00Z'), layers: [], statistics: [], zones: [], evidence: null, comparison: null };
  assert.doesNotThrow(() => assertRealSatelliteData(real));
  // sample must not smuggle itself in as real
  assert.notEqual(JSON.parse(JSON.stringify(sample)).source, 'REAL');
});

test('sample is deterministic', () => {
  const a = buildSamplePreview({ fieldId: 'f1', boundary: rect, reason: 'FAILED' }, NOW);
  const b = buildSamplePreview({ fieldId: 'f1', boundary: rect, reason: 'FAILED' }, NOW);
  assert.deepEqual(a, b);
  assert.ok(a.zones.length >= 2);
  assert.deepEqual(a.statistics.map((x) => x.index).sort(), ['EVI', 'NDMI', 'NDVI', 'NDWI']);
  assert.equal(a.comparison.observations.length, 4);
});

test('sample zone geometry stays inside the field boundary (convex and concave)', () => {
  for (const boundary of [rect, ell]) {
    const sample = buildSamplePreview({ fieldId: 'f1', boundary, reason: 'CLOUD_BLOCKED' }, NOW);
    assert.ok(sample.zones.length >= 2, 'zones produced');
    for (const zone of sample.zones) {
      assert.ok(isPolygonInsideBoundary(zone.geometry, boundary), zone.id);
      assert.ok(zone.areaHectares > 0);
      for (const [x, y] of zone.geometry.coordinates[0]) {
        const xs = boundary.coordinates[0].map((p) => p[0]), ys = boundary.coordinates[0].map((p) => p[1]);
        assert.ok(x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys));
      }
      // independent concavity check: the L-shape's missing corner must never be covered
      if (boundary === ell) assert.ok(!zone.geometry.coordinates[0].some(([x, y]) => x > 72.502 && y > 31.502));
    }
  }
});

test('isPolygonInsideBoundary rejects polygons outside or crossing the edge', () => {
  const outside = { type: 'Polygon', coordinates: [[[72.51, 31.5], [72.511, 31.5], [72.511, 31.501], [72.51, 31.501], [72.51, 31.5]]] };
  const crossing = { type: 'Polygon', coordinates: [[[72.503, 31.5015], [72.506, 31.5015], [72.506, 31.5025], [72.503, 31.5025], [72.503, 31.5015]]] };
  assert.equal(isPolygonInsideBoundary(outside, rect), false);
  assert.equal(isPolygonInsideBoundary(crossing, rect), false);
  const notchCorner = { type: 'Polygon', coordinates: [[[72.503, 31.503], [72.504, 31.503], [72.504, 31.504], [72.503, 31.504], [72.503, 31.503]]] };
  assert.equal(isPolygonInsideBoundary(notchCorner, ell), false);
});

test('degenerate boundary yields no zones rather than outside zones', () => {
  const line = { type: 'Polygon', coordinates: [[[72.5, 31.5], [72.5, 31.5], [72.5, 31.5], [72.5, 31.5]]] };
  const sample = buildSamplePreview({ fieldId: 'f1', boundary: line, reason: 'NONE' }, NOW);
  assert.equal(sample.zones.length, 0);
});

test('workspace source never persists or exports sample values', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../components/intelligence/satellite-workspace.tsx'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src));
  const sample = fs.readFileSync(path.join(root, 'sample-preview.ts'), 'utf8');
  assert.ok(!/fetch\(|localStorage|sessionStorage/.test(sample));
});
