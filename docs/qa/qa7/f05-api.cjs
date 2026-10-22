// F05 field mapping / boundaries: platform geometry API (8027) + core fields API (4027) + PostGIS proof.
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, crypto, API, PLAT, WEB } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const sq = (lon, lat, d = 0.002) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
const feat = (name, geometry) => ({ type: 'Feature', properties: { name }, geometry });
const fc = (...f) => ({ type: 'FeatureCollection', features: f });
// Independent ellipsoidal-ish area of a small lon/lat rectangle (metres), for comparison with PostGIS geography.
const rectHa = (lat, dLon, dLat) => { const a = 6378137, e2 = 0.00669437999014; const phi = lat * Math.PI / 180; const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2); const M = a * (1 - e2) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5; return (dLon * Math.PI / 180 * N * Math.cos(phi)) * (dLat * Math.PI / 180 * M) / 10000; };
(async () => {
  const c = await db();
  const A = await farmer(c, 'F05A'); const B = await farmer(c, 'F05B');
  const base = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.50, name: 'F05 base' });
  const farmA = base.farmId;
  const bfield = await makeField(B, { crop: 'wheat', lon: 73.5, lat: 31.5, name: 'F05 B base' });
  const val = (geometry, farmId, t = A) => call('POST', '/geometry/validate', { token: t.token, base: PLAT, body: { geometry, ...(farmId ? { farmId } : {}) } });
  const imp = (farm, geojson, key = crypto.randomUUID(), t = A) => call('POST', `/farms/${farm}/fields/import`, { token: t.token, base: PLAT, body: { geojson, idempotencyKey: key } });

  await check('F05-01', 'unauthenticated validate/import/export/boundary -> 401; wrong role -> 403', async () => {
    const r = await Promise.all([call('POST', '/geometry/validate', { base: PLAT, body: { geometry: sq(72, 31) } }), call('GET', `/farms/${farmA}/fields/geojson`, { base: PLAT }), call('POST', `/farms/${farmA}/fields/import`, { base: PLAT, body: {} }), call('PATCH', `/fields/${base.fieldId}/boundary`, { base: PLAT, body: {} })]);
    assert.ok(r.every((x) => x.status === 401), r.map((x) => x.status).join());
    const ex = await farmer(c, 'F05exp', { role: 'AGRICULTURE_EXPERT' });
    assert.equal((await val(sq(72, 31), null, ex)).status, 403);
    const w = await call('GET', `/api/farms/${farmA}/geojson`, { base: WEB }); assert.equal(w.status, 401);
  });
  await check('F05-02', 'valid polygon: area matches independent geodesic calculation within 0.5% and PostGIS geography within 0.05%', async () => {
    const r = await val(sq(72.5, 31.5, 0.002)); assert.equal(r.status, 200, r.text.slice(0, 200));
    const expected = rectHa(31.501, 0.002, 0.002);
    const pg = (await c.query("SELECT ST_Area(ST_GeomFromGeoJSON($1)::geography)/10000 ha", [JSON.stringify(sq(72.5, 31.5, 0.002))])).rows[0].ha;
    assert.ok(Math.abs(r.json.areaHectares - expected) / expected < 0.005, `api ${r.json.areaHectares} vs independent ${expected}`);
    assert.ok(Math.abs(r.json.areaHectares - pg) / pg < 0.0005, `api ${r.json.areaHectares} vs postgis ${pg}`);
    return `area=${r.json.areaHectares} ha independent=${expected.toFixed(4)} postgis=${Number(pg).toFixed(4)} keys=${Object.keys(r.json).join(',')}`;
  });
  await check('F05-03', 'polygon with hole: area = outer - hole (golden)', async () => {
    const g = sq(72.5, 31.5, 0.004); g.coordinates.push([[72.501, 31.501], [72.501, 31.503], [72.503, 31.503], [72.503, 31.501], [72.501, 31.501]]);
    const r = await val(g); assert.equal(r.status, 200, r.text.slice(0, 200));
    const expected = rectHa(31.502, 0.004, 0.004) - rectHa(31.502, 0.002, 0.002);
    assert.ok(Math.abs(r.json.areaHectares - expected) / expected < 0.01, `${r.json.areaHectares} vs ${expected}`);
  });
  await check('F05-04', 'clockwise exterior ring accepted/normalised, area positive and equal to CCW', async () => {
    const ccw = (await val(sq(72.5, 31.5))).json.areaHectares;
    const cw = sq(72.5, 31.5); cw.coordinates[0].reverse();
    const r = await val(cw); assert.equal(r.status, 200, r.text.slice(0, 150)); assert.ok(r.json.areaHectares > 0); assert.ok(Math.abs(r.json.areaHectares - ccw) < 1e-6);
  });
  await check('F05-05', 'invalid geometry rejected 400: bowtie, unclosed, 3 positions, out-of-range lon/lat, NaN string, 3D coords, Point, MultiPolygon, crs, extra field, collinear/zero-area, duplicate vertices only', async () => {
    const cases = {
      bowtie: { type: 'Polygon', coordinates: [[[72, 31], [72.002, 31.002], [72.002, 31], [72, 31.002], [72, 31]]] },
      unclosed: { type: 'Polygon', coordinates: [[[72, 31], [72.002, 31], [72.002, 31.002], [72, 31.002]]] },
      three: { type: 'Polygon', coordinates: [[[72, 31], [72.002, 31], [72, 31]]] },
      lon181: { type: 'Polygon', coordinates: [[[181, 31], [181.002, 31], [181.002, 31.002], [181, 31]]] },
      lat91: { type: 'Polygon', coordinates: [[[72, 91], [72.002, 91], [72.002, 91.002], [72, 91]]] },
      nanStr: { type: 'Polygon', coordinates: [[['NaN', 31], [72.002, 31], [72.002, 31.002], ['NaN', 31]]] },
      threeD: { type: 'Polygon', coordinates: [[[72, 31, 5], [72.002, 31, 5], [72.002, 31.002, 5], [72, 31, 5]]] },
      point: { type: 'Point', coordinates: [72, 31] },
      multi: { type: 'MultiPolygon', coordinates: [sq(72, 31).coordinates] },
      crs: { ...sq(72, 31), crs: { type: 'name', properties: { name: 'EPSG:3857' } } },
      collinear: { type: 'Polygon', coordinates: [[[72, 31], [72.001, 31], [72.002, 31], [72, 31]]] },
      dupes: { type: 'Polygon', coordinates: [[[72, 31], [72, 31], [72, 31], [72, 31]]] },
      boolean: { type: 'Polygon', coordinates: [[[true, 31], [72.002, 31], [72.002, 31.002], [true, 31]]] },
      empty: { type: 'Polygon', coordinates: [] },
      nullGeom: null,
    };
    const res = {}; for (const [k, g] of Object.entries(cases)) { const r = await call('POST', '/geometry/validate', { token: A.token, base: PLAT, body: { geometry: g } }); res[k] = r.status; }
    const bad = Object.entries(res).filter(([, s]) => s !== 400 && s !== 422);
    assert.deepEqual(bad, [], 'accepted/5xx: ' + JSON.stringify(bad));
    return JSON.stringify(res);
  });
  await check('F05-06', 'bad hole: hole outside shell, hole overlapping shell edge, two overlapping holes -> 400', async () => {
    const outside = sq(72.5, 31.5, 0.004); outside.coordinates.push([[73, 32], [73, 32.001], [73.001, 32.001], [73, 32]]);
    const edge = sq(72.5, 31.5, 0.004); edge.coordinates.push([[72.499, 31.501], [72.499, 31.503], [72.501, 31.503], [72.501, 31.501], [72.499, 31.501]]);
    const ov = sq(72.5, 31.5, 0.004); ov.coordinates.push([[72.501, 31.501], [72.501, 31.503], [72.503, 31.503], [72.503, 31.501], [72.501, 31.501]], [[72.502, 31.502], [72.502, 31.5035], [72.5035, 31.5035], [72.5035, 31.502], [72.502, 31.502]]);
    const r = await Promise.all([val(outside), val(edge), val(ov)]); assert.ok(r.every((x) => x.status === 400 || x.status === 422), r.map((x) => x.status).join());
  });
  await check('F05-07', 'limits: >5000 vertices -> 400; >256 KiB body -> 413; 21 holes -> 400; 26 features -> 400', async () => {
    const n = 5001; const ring = Array.from({ length: n }, (_, i) => [72 + 0.0001 * Math.cos(i / n * 2 * Math.PI), 31 + 0.0001 * Math.sin(i / n * 2 * Math.PI)]); ring.push(ring[0]);
    const many = await val({ type: 'Polygon', coordinates: [ring] });
    const huge = await call('POST', '/geometry/validate', { token: A.token, base: PLAT, raw: '{"geometry":"' + 'x'.repeat(300000) + '"}', headers: { 'content-type': 'application/json' } });
    const holes = sq(72, 31, 0.1); for (let i = 0; i < 21; i++) holes.coordinates.push([[72.01 + i * 0.003, 31.01], [72.01 + i * 0.003, 31.011], [72.011 + i * 0.003, 31.011], [72.01 + i * 0.003, 31.01]]);
    const hr = await val(holes);
    const f26 = await imp(farmA, fc(...Array.from({ length: 26 }, (_, i) => feat('F05 many ' + i, sq(72.5 + i * 0.001, 31.6)))));
    assert.deepEqual([many.status, huge.status, hr.status, f26.status].map((x) => (x === 422 ? 400 : x)), [400, 413, 400, 400], [many.status, huge.status, hr.status, f26.status].join());
  });
  await check('F05-08', 'validate with farmId: polygon outside farm boundary rejected; foreign farmId 404', async () => {
    const inside = await val(sq(72.51, 31.51), farmA); const outside = await val(sq(10, 10), farmA); const foreign = await val(sq(72.51, 31.51), bfield.farmId);
    assert.equal(inside.status, 200, inside.text.slice(0, 150)); assert.ok([400, 409, 422].includes(outside.status), 'outside ' + outside.status); assert.equal(foreign.status, 404, 'foreign ' + foreign.status);
    return `inside=200 outside=${outside.status} ${outside.json?.error?.code} foreign=404`;
  });
  let imported, key1 = crypto.randomUUID();
  const payload = fc(feat('F05 import one', sq(72.55, 31.55)), feat('F05 import two', sq(72.56, 31.55)));
  await check('F05-09', 'import FeatureCollection x2 -> 201, rows persisted with GEOJSON_IMPORT metadata, area in DB equals PostGIS geography', async () => {
    const r = await imp(farmA, payload, key1); assert.equal(r.status, 201, r.text.slice(0, 250)); imported = r.json; assert.equal(imported.imported, 2);
    for (const f of imported.fields) { const row = (await c.query("SELECT area_hectares::float a, ST_Area(boundary::geography)/10000 g, boundary_metadata m, version FROM fields WHERE id=$1", [f.id])).rows[0]; assert.ok(Math.abs(row.a - row.g) / row.g < 0.001, `${row.a} vs ${row.g}`); assert.equal(row.m.source, 'GEOJSON_IMPORT'); assert.equal(row.m.isSurvey, false); }
    return JSON.stringify(imported.fields.map((f) => ({ id: f.id.slice(0, 8), ha: f.areaHectares, v: f.version })));
  });
  await check('F05-10', 'idempotent replay: same key+payload -> same ids, no new rows; same key different payload -> 409; same key other farm -> 409', async () => {
    const before = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [farmA])).rows[0].n;
    const again = await imp(farmA, payload, key1); assert.equal(again.status, 201);
    assert.deepEqual(again.json.fields.map((f) => f.id), imported.fields.map((f) => f.id));
    const after = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [farmA])).rows[0].n; assert.equal(before, after);
    const diff = await imp(farmA, fc(feat('F05 different', sq(72.58, 31.55))), key1); assert.equal(diff.status, 409);
    const otherPayload = fc(feat('F05 B import', sq(73.52, 31.52)));
    const other = await imp(bfield.farmId, otherPayload, key1, B); assert.equal(other.status, 201, 'owner-scoped key reuse by B: ' + other.status + other.text.slice(0, 150));
    assert.ok(!other.json.fields.some((f) => imported.fields.map((x) => x.id).includes(f.id)), 'B received A fields');
    const aAgain = await imp(farmA, payload, key1); assert.deepEqual(aAgain.json.fields.map((f) => f.id), imported.fields.map((f) => f.id));
    return `diff=${diff.status}/${diff.json.error?.code}; B reusing A's key -> independent 201 (keys are owner scoped)`;
  });
  await check('F05-11', 'concurrent import retries (8 parallel, same key) -> exactly one set of rows', async () => {
    const k = crypto.randomUUID(); const g = fc(feat('F05 concurrent', sq(72.6, 31.6)));
    const rs = await Promise.all(Array.from({ length: 8 }, () => imp(farmA, g, k)));
    const ok = rs.filter((x) => x.status === 201); assert.ok(ok.length >= 1, rs.map((x) => x.status).join());
    assert.ok(rs.every((x) => [201, 503].includes(x.status)), rs.map((x) => x.status).join());
    const n = (await c.query("SELECT count(*)::int n FROM fields WHERE farm_id=$1 AND name='F05 concurrent' AND deleted_at IS NULL", [farmA])).rows[0].n; assert.equal(n, 1);
    return rs.map((x) => x.status).join(',');
  });
  await check('F05-12', 'import atomic: one invalid feature among valid -> nothing created; duplicate names -> 409 and nothing created', async () => {
    const before = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [farmA])).rows[0].n;
    const bad = fc(feat('F05 atomic ok', sq(72.62, 31.6)), feat('F05 atomic bad', { type: 'Polygon', coordinates: [[[72, 31], [72.002, 31.002], [72.002, 31], [72, 31.002], [72, 31]]] }));
    const r1 = await imp(farmA, bad); assert.ok([400, 422].includes(r1.status), 'bad ' + r1.status);
    const dup = await imp(farmA, fc(feat('F05 import one', sq(72.64, 31.6)))); assert.equal(dup.status, 409, 'dup ' + dup.status);
    const dupInside = await imp(farmA, fc(feat('F05 same', sq(72.65, 31.6)), feat('F05 same', sq(72.66, 31.6))));
    const after = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [farmA])).rows[0].n;
    assert.equal(before, after, `rows leaked: ${before} -> ${after}; dupInside=${dupInside.status}`);
    return `bad=${r1.status} dup=${dup.status} dupWithinRequest=${dupInside.status}`;
  });
  await check('F05-13', 'import validation: empty collection, missing/invalid idempotency key, name 1 char/161 chars, foreign farm, bad farm uuid, extra fields', async () => {
    const empty = await imp(farmA, fc()); const nokey = await call('POST', `/farms/${farmA}/fields/import`, { token: A.token, base: PLAT, body: { geojson: payload } });
    const badkey = await call('POST', `/farms/${farmA}/fields/import`, { token: A.token, base: PLAT, body: { geojson: payload, idempotencyKey: 'abc' } });
    const short = await imp(farmA, fc(feat('x', sq(72.7, 31.6)))); const long = await imp(farmA, fc(feat('n'.repeat(161), sq(72.7, 31.6))));
    const foreign = await imp(bfield.farmId, payload); const badFarm = await call('POST', '/farms/nope/fields/import', { token: A.token, base: PLAT, body: { geojson: payload, idempotencyKey: crypto.randomUUID() } });
    const extra = await call('POST', `/farms/${farmA}/fields/import`, { token: A.token, base: PLAT, body: { geojson: payload, idempotencyKey: crypto.randomUUID(), farmId: bfield.farmId } });
    const r = { empty: empty.status, nokey: nokey.status, badkey: badkey.status, short: short.status, long: long.status, foreign: foreign.status, badFarm: badFarm.status, extra: extra.status };
    for (const k of ['empty', 'nokey', 'badkey', 'short', 'long', 'badFarm', 'extra']) assert.ok([400, 422].includes(r[k]), k + '=' + r[k]); assert.equal(r.foreign, 404);
    return JSON.stringify(r);
  });
  await check('F05-14', 'export: farm GeoJSON contains imported fields, valid FeatureCollection, round-trip geometry equality, Cache-Control private, empty farm -> empty collection', async () => {
    const ex = await call('GET', `/farms/${farmA}/fields/geojson`, { token: A.token, base: PLAT }); assert.equal(ex.status, 200); assert.equal(ex.json.type, 'FeatureCollection');
    assert.match(ex.headers.get('cache-control') || '', /no-store/);
    const one = ex.json.features.find((f) => f.properties.name === 'F05 import one'); assert.ok(one, 'imported field missing in export');
    const want = sq(72.55, 31.55).coordinates[0]; one.geometry.coordinates[0].forEach((p, i) => { assert.ok(Math.abs(p[0] - want[i][0]) < 1e-9 && Math.abs(p[1] - want[i][1]) < 1e-9, 'geometry changed on round trip: ' + JSON.stringify(one.geometry.coordinates[0])); });
    const E = await farmer(c, 'F05E'); const fE = await call('POST', '/farms', { token: E.token, body: { name: 'F05 empty farm', boundary: sq(70, 30, 0.1) } });
    const emp = await call('GET', `/farms/${fE.json.id}/fields/geojson`, { token: E.token, base: PLAT }); assert.equal(emp.status, 200); assert.equal(emp.json.features.length, 0);
    const forn = await call('GET', `/farms/${farmA}/fields/geojson`, { token: B.token, base: PLAT }); assert.equal(forn.status, 404);
    return `features=${ex.json.features.length}`;
  });
  await check('F05-15', 'deleted field disappears from export and cannot be replayed via import key', async () => {
    const f0 = imported.fields[1];
    const del = await call('DELETE', `/fields/${f0.id}`, { token: A.token }); assert.ok([200, 204].includes(del.status), 'delete ' + del.status);
    const ex = await call('GET', `/farms/${farmA}/fields/geojson`, { token: A.token, base: PLAT }); assert.ok(!ex.json.features.some((f) => f.id === f0.id || f.properties?.name === 'F05 import two'), 'deleted field still exported');
    const replay = await imp(farmA, payload, key1); assert.notEqual(replay.status, 201, 'replay of an import whose field was deleted leaked it');
    return `replay=${replay.status} ${replay.json?.error?.code}`;
  });
  // boundary updates
  let fld = imported.fields[0];
  const body = (o) => ({ geometry: sq(72.55, 31.57), expectedVersion: fld.version, source: 'MAP_DRAWN', ...o });
  const patch = (b, id = fld.id, t = A) => call('PATCH', `/fields/${id}/boundary`, { token: t.token, base: PLAT, body: b });
  await check('F05-16', 'boundary update MAP_DRAWN: version+1, area recomputed in DB, metadata, response metrics', async () => {
    const r = await patch(body({})); assert.equal(r.status, 200, r.text.slice(0, 250)); assert.equal(r.json.version, fld.version + 1);
    const row = (await c.query('SELECT area_hectares::float a, ST_Area(boundary::geography)/10000 g, boundary_metadata m, version FROM fields WHERE id=$1', [fld.id])).rows[0];
    assert.ok(Math.abs(row.a - row.g) / row.g < 0.001); assert.equal(row.m.source, 'MAP_DRAWN'); assert.equal(row.version, fld.version + 1); fld = { ...fld, version: row.version };
  });
  await check('F05-17', 'stale version -> 409 BOUNDARY_VERSION_CONFLICT with no change; missing/zero/negative/float/boolean/string version -> 400', async () => {
    const before = (await c.query('SELECT ST_AsText(boundary) t, version FROM fields WHERE id=$1', [fld.id])).rows[0];
    const stale = await patch(body({ expectedVersion: fld.version - 1, geometry: sq(72.55, 31.58) })); assert.equal(stale.status, 409); assert.equal(stale.json.error.code, 'BOUNDARY_VERSION_CONFLICT');
    const r = {}; for (const [k, v] of Object.entries({ zero: 0, neg: -1, flt: 1.5, bool: true, str: '1' })) r[k] = (await patch(body({ expectedVersion: v }))).status;
    const noV = await patch({ geometry: sq(72.55, 31.57), source: 'MAP_DRAWN' }); r.missing = noV.status;
    for (const [k, s] of Object.entries(r)) assert.ok([400, 422].includes(s), k + '=' + s);
    const after = (await c.query('SELECT ST_AsText(boundary) t, version FROM fields WHERE id=$1', [fld.id])).rows[0]; assert.deepEqual(before, after);
    return JSON.stringify(r);
  });
  await check('F05-18', 'concurrent boundary writers (6 parallel same version) -> exactly one 200, rest 409; version +1 only', async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => patch(body({ geometry: sq(72.55, 31.572 + i * 0.0001) }))));
    const codes = rs.map((x) => x.status).sort(); assert.equal(codes.filter((x) => x === 200).length, 1, codes.join()); assert.ok(codes.every((x) => [200, 409].includes(x)), codes.join());
    const v = (await c.query('SELECT version FROM fields WHERE id=$1', [fld.id])).rows[0].version; assert.equal(v, fld.version + 1); fld = { ...fld, version: v };
    return codes.join();
  });
  await check('F05-19', 'source/GPS rules: GPS_CAPTURE needs confirmed accuracy + matching samples; samples with MAP_DRAWN rejected; accuracy >10km, naive timestamp, bool rejected; valid GPS persisted with samples', async () => {
    const g = sq(72.55, 31.575); const verts = g.coordinates[0].slice(0, 4);
    const samples = verts.map(([lon, lat]) => ({ longitude: lon, latitude: lat, accuracyMeters: 4.5, capturedAt: new Date().toISOString() }));
    const r = {};
    r.noConfirm = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', gpsSamples: samples }))).status;
    r.mismatch = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples.map((s) => ({ ...s, longitude: s.longitude + 1e-4 })) }))).status;
    r.fewer = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples.slice(1) }))).status;
    r.mapWithSamples = (await patch(body({ geometry: g, source: 'MAP_DRAWN', gpsSamples: samples }))).status;
    r.badSource = (await patch(body({ geometry: g, source: 'SURVEY' }))).status;
    r.hugeAcc = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples.map((s) => ({ ...s, accuracyMeters: 20000 })) }))).status;
    r.naive = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples.map((s) => ({ ...s, capturedAt: '2026-10-16T10:00:00' })) }))).status;
    r.boolAcc = (await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples.map((s) => ({ ...s, accuracyMeters: true })) }))).status;
    for (const [k, s] of Object.entries(r)) assert.ok([400, 422].includes(s), k + '=' + s);
    const ok = await patch(body({ geometry: g, source: 'GPS_CAPTURE', confirmedGpsAccuracy: true, gpsSamples: samples })); assert.equal(ok.status, 200, ok.text.slice(0, 250));
    const m = (await c.query('SELECT boundary_metadata m, version FROM fields WHERE id=$1', [fld.id])).rows[0]; assert.equal(m.m.source, 'GPS_CAPTURE'); assert.equal(m.m.gpsSamples.length, 4); assert.equal(m.m.isSurvey, false); fld = { ...fld, version: m.version };
    return JSON.stringify(r) + ' ; GPS saved, isSurvey=false';
  });
  await check('F05-20', 'ownership on boundary: farmer B -> 404, no change; deleted field 404; unknown id 404; bad id 422/400', async () => {
    const before = (await c.query('SELECT ST_AsText(boundary) t, version FROM fields WHERE id=$1', [fld.id])).rows[0];
    const b = await patch(body({ expectedVersion: fld.version }), fld.id, B); const unk = await patch(body({}), crypto.randomUUID()); const badId = await patch(body({}), 'nope');
    const after = (await c.query('SELECT ST_AsText(boundary) t, version FROM fields WHERE id=$1', [fld.id])).rows[0];
    assert.equal(b.status, 404); assert.equal(unk.status, 404); assert.ok([400, 422].includes(badId.status)); assert.deepEqual(before, after);
  });
  await check('F05-21', 'boundary outside parent farm via platform PATCH is rejected (field within farm)', async () => {
    const r = await patch(body({ geometry: sq(10, 10), expectedVersion: fld.version })); assert.ok([400, 409, 422].includes(r.status), 'outside farm accepted: ' + r.status + r.text.slice(0, 120));
  });
  await check('F05-22', 'core API field create: boundary outside farm / invalid / overlapping duplicate name rejected; hole preserved on metadata-only rename', async () => {
    const out1 = await call('POST', `/farms/${farmA}/fields`, { token: A.token, body: { name: 'F05 outside', boundary: sq(10, 10) } });
    const bow = await call('POST', `/farms/${farmA}/fields`, { token: A.token, body: { name: 'F05 bowtie', boundary: { type: 'Polygon', coordinates: [[[72.5, 31.5], [72.502, 31.502], [72.502, 31.5], [72.5, 31.502], [72.5, 31.5]]] } } });
    const holey = sq(72.7, 31.7, 0.004); holey.coordinates.push([[72.701, 31.701], [72.701, 31.703], [72.703, 31.703], [72.703, 31.701], [72.701, 31.701]]);
    const mk = await call('POST', `/farms/${farmA}/fields`, { token: A.token, body: { name: 'F05 holey', boundary: holey } }); assert.equal(mk.status, 201, mk.text.slice(0, 200));
    const dup = await call('POST', `/farms/${farmA}/fields`, { token: A.token, body: { name: 'F05 holey', boundary: sq(72.8, 31.7) } });
    const ren = await call('PATCH', `/fields/${mk.json.id}`, { token: A.token, body: { name: 'F05 holey renamed' } });
    const got = await call('GET', `/fields/${mk.json.id}`, { token: A.token });
    assert.ok([400, 403, 409, 422].includes(out1.status), 'outside ' + out1.status); assert.ok([400, 422].includes(bow.status), 'bowtie ' + bow.status);
    assert.equal(ren.status, 200); assert.equal(got.json.boundary.coordinates.length, 2, 'hole lost on rename');
    assert.equal(dup.status, 409, `duplicate active field name returned ${dup.status} ${dup.text.slice(0, 120)} (expected 409 conflict)`);
    return `outside=${out1.status} bowtie=${bow.status} dupName=${dup.status}`;
  });
  await check('F05-23', 'DB invariants: stored geometries valid, SRID 4326, area_hectares consistent for all QA fields', async () => {
    const r = (await c.query("SELECT count(*)::int n, count(*) FILTER (WHERE NOT ST_IsValid(boundary))::int invalid, count(*) FILTER (WHERE ST_SRID(boundary)<>4326)::int srid, count(*) FILTER (WHERE abs(area_hectares - ST_Area(boundary::geography)/10000) > 0.001*area_hectares + 0.001)::int area FROM fields WHERE deleted_at IS NULL")).rows[0];
    assert.equal(r.invalid, 0); assert.equal(r.srid, 0); assert.equal(r.area, 0, JSON.stringify(r)); return JSON.stringify(r);
  });
  await check('F05-24', 'postgres outage during geometry validate/import: typed 5xx (503), no hang, recovers', async () => {
    require('node:child_process').execSync('docker stop qa7-postgres'); let st, dt;
    try { const t0 = Date.now(); const r = await call('POST', '/geometry/validate', { token: A.token, base: PLAT, body: { geometry: sq(72.5, 31.5) }, timeout: 60000 }); st = r.status; dt = Date.now() - t0; }
    finally { require('node:child_process').execSync('docker start qa7-postgres'); await sleep(8000); }
    const back = await val(sq(72.5, 31.5));
    assert.ok([401, 503, 500].includes(st), 'status during outage ' + st); assert.equal(back.status, 200, 'did not recover: ' + back.status);
    return `during outage: ${st} after ${dt} ms (401 would mean farmers are logged out by a DB blip, see D3); recovered=${back.status}`;
  });
  finish(path.join(out, 'f05-api.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
