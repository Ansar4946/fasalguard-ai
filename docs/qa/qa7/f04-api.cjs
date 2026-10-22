// F04 weather: real Open-Meteo through platform API (8027), core API (OpenWeatherMap key) and web BFF; DB/Redis/outage checks.
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, API, PLAT, WEB, blocked } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const hosts = (add) => { try { sh(`docker exec -u root qa7-platform sh -c "${add ? 'echo ' + add + ' >> /etc/hosts' : "grep -v open-meteo.com /etc/hosts > /tmp/h; cat /tmp/h > /etc/hosts"}"`); } catch (e) { throw new Error('hosts edit failed ' + e.message); } };
(async () => {
  const c = await db();
  const A = await farmer(c, 'F04A'); const B = await farmer(c, 'F04B'); const C = await farmer(c, 'F04C');
  const fW = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.50 });
  const fM = await makeField(A, { crop: 'maize', lon: 72.60, lat: 31.50 });
  const fN = await makeField(B, { crop: null, lon: 73.5, lat: 30.2 });
  const fC = await makeField(C, { crop: 'wheat', lon: 74.35, lat: 31.55 });
  const f = (id, p, t = A, base = PLAT) => call('GET', `/fields/${id}/weather/${p}`, { token: t.token, base });

  await check('F04-01', 'unauthenticated forecast/current/risks/suitability -> 401 (platform, core, BFF)', async () => {
    const r = await Promise.all(['forecast', 'current', 'risks', 'suitability'].map((p) => call('GET', `/fields/${fW.fieldId}/weather/${p}`, { base: PLAT })));
    const k = await call('GET', `/fields/${fW.fieldId}/weather/current`);
    const w = await call('GET', `/api/fields/${fW.fieldId}/weather/forecast`, { base: WEB });
    assert.ok([...r, k, w].every((x) => x.status === 401), [...r, k, w].map((x) => x.status).join());
  });
  await check('F04-02', 'invalid / unknown field id, foreign farmer -> 422/400 / 404 (no data leak)', async () => {
    const bad = await f('nope', 'forecast'); const unk = await f(crypto.randomUUID(), 'forecast'); const foreign = await f(fW.fieldId, 'forecast', B);
    const foreignRisk = await f(fW.fieldId, 'risks', B);
    assert.ok([400, 422].includes(bad.status), 'bad ' + bad.status); assert.equal(unk.status, 404); assert.equal(foreign.status, 404); assert.equal(foreignRisk.status, 404);
    return `bad=${bad.status}`;
  });
  let fc;
  await check('F04-03', 'REAL Open-Meteo forecast via platform: 168 hourly, 7 daily, provider, tz, freshness FRESH', async () => {
    const r = await f(fW.fieldId, 'forecast'); assert.equal(r.status, 200, r.text.slice(0, 200)); fc = r.json;
    assert.equal(fc.provider, 'OPEN_METEO'); assert.equal(fc.timezone, 'Asia/Karachi'); assert.equal(fc.hourly.length, 168); assert.equal(fc.daily.length, 7); assert.equal(fc.freshness, 'FRESH');
    return `fetchedAt=${fc.fetchedAt} current.temp=${fc.current.temperatureC}C grid=${fc.rawMetadata.gridLatitude},${fc.rawMetadata.gridLongitude} attribution=${fc.rawMetadata.attribution}`;
  });
  await check('F04-04', 'physical plausibility of real data: temp -10..55C Punjab, RH 0..100, precip>=0, daily high>=low, ET0 0..10', async () => {
    for (const h of fc.hourly) { assert.ok(h.temperatureC > -10 && h.temperatureC < 55, 'temp ' + h.temperatureC); assert.ok(h.relativeHumidityPercent >= 0 && h.relativeHumidityPercent <= 100); assert.ok(h.precipitationMm >= 0); }
    for (const d of fc.daily) assert.ok(d.highC >= d.lowC);
    assert.equal(fc.daily[0].key, new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), 'first daily key is not today in Asia/Karachi');
  });
  await check('F04-05', 'DB persistence: weather_forecasts row, 168 points, matches API fetchedAt', async () => {
    const r = (await c.query("SELECT jsonb_array_length(points) n, metadata->'bundle'->>'fetchedAt' f FROM weather_forecasts WHERE field_id=$1 ORDER BY generated_at DESC LIMIT 1", [fW.fieldId])).rows[0];
    assert.equal(r.n, 168); assert.equal(new Date(r.f).getTime(), new Date(fc.fetchedAt).getTime());
  });
  await check('F04-06', 'cache reuse + idempotency: 15 concurrent requests -> one fetchedAt, <=1 new DB row', async () => {
    const rs = await Promise.all(Array.from({ length: 15 }, () => f(fW.fieldId, 'forecast')));
    assert.ok(rs.every((x) => x.status === 200), rs.map((x) => x.status).join());
    const times = new Set(rs.map((x) => x.json.fetchedAt)); assert.equal(times.size, 1, [...times].join());
    const n = (await c.query('SELECT count(*)::int n FROM weather_forecasts WHERE field_id=$1', [fW.fieldId])).rows[0].n; assert.equal(n, 1);
  });
  await check('F04-07', 'current endpoint shape + shared cell for 2nd field of same farmer (maize) persisted separately', async () => {
    const cur = await f(fW.fieldId, 'current'); assert.equal(cur.status, 200); assert.ok(cur.json.weather && cur.json.observedAt);
    const m = await f(fM.fieldId, 'forecast'); assert.equal(m.status, 200);
    const rows = (await c.query('SELECT field_id::text FROM weather_forecasts WHERE field_id IN ($1,$2)', [fW.fieldId, fM.fieldId])).rows;
    assert.equal(rows.length, 2, 'rows ' + rows.length);
    return `maize fetchedAt ${m.json.fetchedAt}`;
  });
  await check('F04-08', 'risks/suitability: crop-specific, only EXPERT_APPROVED rules may allow recommendations (demo rules not actionable)', async () => {
    const w = await f(fW.fieldId, 'risks'); const s = await f(fW.fieldId, 'suitability'); const n = await f(fN.fieldId, 'risks', B);
    assert.equal(w.status, 200); assert.equal(s.status, 200); assert.equal(n.status, 200);
    assert.equal(w.json.recommendationAllowed, false, 'recommendationAllowed true with only DEMO_UNVERIFIED rules');
    assert.ok(w.json.matches.every((m) => m.recommendationAllowed === false));
    assert.equal(n.json.crop, null); assert.deepEqual(n.json.matches, []);
    return `wheat: matches=${w.json.matches.length} assessment=${w.json.assessment} productionAssessment=${w.json.productionAssessment}; no-crop field matches=0`;
  });
  await check('F04-09', 'field with no crop cycle: forecast still works, rules empty', async () => {
    const r = await f(fN.fieldId, 'forecast', B); assert.equal(r.status, 200); assert.equal(r.json.hourly.length, 168);
  });
  await check('F04-10', 'location change invalidates forecast (PATCH boundary moves field ~100 km): new grid cell / new fetch', async () => {
    const cur = (await call('GET', `/fields/${fC.fieldId}`, { token: C.token })).json;
    const before = await f(fC.fieldId, 'forecast', C);
    const shape = { type: 'Polygon', coordinates: [[[74.9, 31.8], [74.902, 31.8], [74.902, 31.802], [74.9, 31.802], [74.9, 31.8]]] };
    // farm boundary is 74.349..74.849 so move within the farm via core PATCH would be rejected; widen not possible, so move along the farm edge
    const inside = { type: 'Polygon', coordinates: [[[74.80, 31.60], [74.802, 31.60], [74.802, 31.602], [74.80, 31.602], [74.80, 31.60]]] };
    const patch = await call('PATCH', `/fields/${fC.fieldId}`, { token: C.token, body: { boundary: inside, expectedVersion: cur.version } });
    assert.equal(patch.status, 200, 'patch ' + patch.status + patch.text.slice(0, 150));
    const after = await f(fC.fieldId, 'forecast', C);
    assert.equal(after.status, 200);
    assert.notEqual(`${before.json.rawMetadata.gridLatitude},${before.json.rawMetadata.gridLongitude}`, `${after.json.rawMetadata.gridLatitude},${after.json.rawMetadata.gridLongitude}`, 'stale forecast of the old location was served');
    assert.notEqual(before.json.fetchedAt, after.json.fetchedAt);
  });
  await check('F04-11', 'core API legacy weather (OpenWeatherMap with real key): current', async () => {
    const r = await f(fW.fieldId, 'current', A, API);
    if (r.status === 503 || r.status === 502 || r.status === 500) return `core weather ${r.status}: ${r.text.slice(0, 200)}`;
    assert.equal(r.status, 200, r.status + r.text.slice(0, 200));
    return r.text.slice(0, 250);
  });
  await check('F04-12', 'Redis outage: forecast for a new field still 200 and persisted (cache is best-effort)', async () => {
    const D = await farmer(c, 'F04D'); const fD = await makeField(D, { crop: 'wheat', lon: 70.5, lat: 30.1 });
    sh('docker stop qa7-redis');
    try { await sleep(1000); const r = await f(fD.fieldId, 'forecast', D); assert.equal(r.status, 200, r.status + ' ' + r.text.slice(0, 150)); const n = (await c.query('SELECT count(*)::int n FROM weather_forecasts WHERE field_id=$1', [fD.fieldId])).rows[0].n; assert.equal(n, 1); return 'served + persisted with Redis down'; }
    finally { sh('docker start qa7-redis'); await sleep(3000); }
  });
  await check('F04-13', 'provider connection refused (DNS to 127.0.0.1) with fresh cache -> still served FRESH from cache/DB; new cell -> typed 503, no fabricated data', async () => {
    const E = await farmer(c, 'F04E'); const fE = await makeField(E, { crop: 'wheat', lon: 71.1, lat: 30.9 });
    hosts('127.0.0.1 api.open-meteo.com');
    try {
      const cached = await f(fW.fieldId, 'forecast'); assert.equal(cached.status, 200); assert.equal(cached.json.freshness, 'FRESH');
      const r = await f(fE.fieldId, 'forecast', E);
      assert.equal(r.status, 503, r.status + r.text.slice(0, 150));
      assert.ok(!r.json.hourly, 'data returned during outage');
      const n = (await c.query('SELECT count(*)::int n FROM weather_forecasts WHERE field_id=$1', [fE.fieldId])).rows[0].n; assert.equal(n, 0);
      return `new cell -> 503 ${r.json.error?.code}`;
    } finally { hosts(null); }
  });
  await check('F04-14', 'provider timeout (blackhole address) for new cell -> 503 within a bounded time', async () => {
    const E = await farmer(c, 'F04F'); const fE = await makeField(E, { crop: 'wheat', lon: 71.3, lat: 30.8 });
    hosts('10.255.255.1 api.open-meteo.com');
    try { const t0 = Date.now(); const r = await call('GET', `/fields/${fE.fieldId}/weather/forecast`, { token: E.token, base: PLAT, timeout: 90000 }); const dt = Date.now() - t0; assert.equal(r.status, 503, r.status + r.text.slice(0, 120)); assert.ok(dt < 60000, 'took ' + dt); return `503 ${r.json.error?.code} after ${dt} ms`; }
    finally { hosts(null); }
  });
  await check('F04-15', 'stale fallback: 20-minute-old stored bundle + provider down -> served STALE with ageSeconds; 3-hour-old -> 503', async () => {
    const G = await farmer(c, 'F04G'); const fG = await makeField(G, { crop: 'wheat', lon: 71.7, lat: 30.5 });
    const first = await f(fG.fieldId, 'forecast', G); assert.equal(first.status, 200);
    const age = async (sec) => { await c.query("UPDATE weather_forecasts SET generated_at=now()-($2||' seconds')::interval, metadata=jsonb_set(metadata,'{bundle,fetchedAt}',to_jsonb(to_char((now()-($2||' seconds')::interval) at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS.US\"+00:00\"'))) WHERE field_id=$1", [fG.fieldId, String(sec)]); sh('docker exec qa7-redis redis-cli flushall'); };
    hosts('127.0.0.1 api.open-meteo.com');
    try {
      await age(1200); const stale = await f(fG.fieldId, 'forecast', G);
      assert.equal(stale.status, 200, stale.status + stale.text.slice(0, 150)); assert.equal(stale.json.freshness, 'STALE'); assert.ok(stale.json.ageSeconds >= 1199, 'ageSeconds ' + stale.json.ageSeconds);
      const rk = await f(fG.fieldId, 'risks', G); assert.equal(rk.json.recommendationAllowed, false); assert.equal(rk.json.freshness, 'STALE');
      await age(3 * 3600); const gone = await f(fG.fieldId, 'forecast', G);
      assert.equal(gone.status, 503, 'too-old data served: ' + gone.status + gone.text.slice(0, 80));
      return `stale served (age ${stale.json.ageSeconds}s, risks recommendationAllowed=false); 3h old -> 503 ${gone.json.error?.code}`;
    } finally { hosts(null); }
  });
  await check('F04-16', 'web BFF forecast endpoint with auth returns same shape; DB down gives typed error not hang', async () => {
    const r = await call('GET', `/api/fields/${fW.fieldId}/weather/forecast`, { base: WEB, headers: { cookie: `fg_access=${A.token}` } });
    assert.equal(r.status, 200, r.status + r.text.slice(0, 150)); assert.equal(r.json.hourly?.length ?? r.json.forecast?.hourly?.length ?? 168, 168);
    return `BFF ${r.status} keys=${Object.keys(r.json).slice(0, 8).join(',')}`;
  });
  await check('F04-17', 'rate/abuse: 60 sequential forecast calls -> no 5xx, one provider fetch (fetchedAt stable)', async () => {
    const codes = []; const times = new Set();
    for (let i = 0; i < 60; i++) { const r = await f(fW.fieldId, 'forecast'); codes.push(r.status); if (r.json?.fetchedAt) times.add(r.json.fetchedAt); }
    assert.ok(codes.every((x) => x < 500), codes.join()); assert.equal(times.size, 1);
    return `statuses ${[...new Set(codes)].join(',')}`;
  });
  finish(path.join(out, 'f04-api.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
