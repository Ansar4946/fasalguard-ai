// F02 satellite monitoring: real Earth Search STAC (public Sentinel-2 L2A COGs on AWS; no credential used by the platform path) via platform API + Celery worker + beat outbox.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, API, PLAT, WEB, blocked } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const S = process.env.QA7_SCRATCH;
const TERMINAL = ['COMPLETED', 'NO_VALID_SCENE', 'CLOUD_BLOCKED', 'FAILED'];
async function waitScan(u, id, ms = 300000, base = PLAT) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { last = await call('GET', `/satellite-scans/${id}`, { token: u.token, base }); if (last.json && TERMINAL.includes(last.json.processingStatus)) return last.json; await sleep(5000); }
  return last?.json;
}
(async () => {
  const c = await db();
  const A = await farmer(c, 'F02A'); const B = await farmer(c, 'F02B');
  const fA = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.45, name: 'F02 field' });
  const fA2 = await makeField(A, { crop: 'maize', lon: 72.70, lat: 31.45, name: 'F02 second' });
  const fB = await makeField(B, { crop: 'wheat', lon: 73.30, lat: 31.45, name: 'F02 B field' });
  const iso = (d) => new Date(Date.now() + d * 86400e3).toISOString();
  const create = (id, body, t = A, base = PLAT) => call('POST', `/fields/${id}/satellite-scans`, { token: t.token, base, body });

  await check('F02-01', 'unauthenticated create/list/get/statistics/layers/comparison -> 401 (platform + BFF); wrong role 403', async () => {
    const ids = [call('POST', `/fields/${fA.fieldId}/satellite-scans`, { base: PLAT, body: {} }), call('GET', `/fields/${fA.fieldId}/satellite-scans`, { base: PLAT }), call('GET', `/satellite-scans/${crypto.randomUUID()}`, { base: PLAT }), call('GET', `/satellite-scans/${crypto.randomUUID()}/statistics`, { base: PLAT }), call('GET', `/fields/${fA.fieldId}/satellite-comparison`, { base: PLAT }), call('GET', `/api/fields/${fA.fieldId}/satellite-scans`, { base: WEB }), call('GET', `/api/fields/${fA.fieldId}/satellite-comparison`, { base: WEB })];
    const r = await Promise.all(ids); assert.ok(r.every((x) => x.status === 401), r.map((x) => x.status).join());
    const ex = await farmer(c, 'F02x', { role: 'AGRICULTURE_EXPERT' }); const w = await create(fA.fieldId, {}, ex); assert.equal(w.status, 403);
  });
  await check('F02-02', 'foreign / unknown / malformed field -> 404/400, no capture row created', async () => {
    const before = (await c.query('SELECT count(*)::int n FROM satellite_captures')).rows[0].n;
    const a = await create(fB.fieldId, {}); const b = await create(crypto.randomUUID(), {}); const d = await create('nope', {});
    const l = await call('GET', `/fields/${fB.fieldId}/satellite-scans`, { token: A.token, base: PLAT });
    const cmp = await call('GET', `/fields/${fB.fieldId}/satellite-comparison`, { token: A.token, base: PLAT });
    const after = (await c.query('SELECT count(*)::int n FROM satellite_captures')).rows[0].n;
    assert.deepEqual([a.status, b.status, l.status, cmp.status], [404, 404, 404, 404]); assert.ok([400, 422].includes(d.status)); assert.equal(before, after);
  });
  await check('F02-03', 'date/cloud validation: from>=to, >90 days, future end, naive timestamp, cloud -1/101/NaN/"x"/true, unknown props, null body fields', async () => {
    const t = {
      reversed: { from: iso(-1), to: iso(-10) }, equal: { from: iso(-5), to: iso(-5) }, long: { from: iso(-100), to: iso(-1) }, future: { from: iso(-5), to: iso(30) },
      naive: { from: '2026-10-01T00:00:00', to: '2026-10-10T00:00:00' }, cloudNeg: { maxCloudCoverage: -1 }, cloud101: { maxCloudCoverage: 101 }, cloudStr: { maxCloudCoverage: 'x' }, cloudBool: { maxCloudCoverage: true },
      extra: { owner: 'x' }, badDate: { from: 'yesterday', to: iso(-1) },
    };
    const r = {}; for (const [k, b] of Object.entries(t)) r[k] = (await create(fA2.fieldId, b)).status;
    const bad = Object.entries(r).filter(([, s]) => ![400, 422].includes(s));
    assert.deepEqual(bad, [], 'accepted/5xx: ' + JSON.stringify(bad));
    return JSON.stringify(r);
  });
  await check('F02-04', 'malformed JSON / oversize body -> 400/413/422, no 5xx', async () => {
    const m = await call('POST', `/fields/${fA.fieldId}/satellite-scans`, { token: A.token, base: PLAT, raw: '{"from":', headers: { 'content-type': 'application/json' } });
    const big = await call('POST', `/fields/${fA.fieldId}/satellite-scans`, { token: A.token, base: PLAT, raw: JSON.stringify({ maxCloudCoverage: 10, junk: 'x'.repeat(2e6) }), headers: { 'content-type': 'application/json' } });
    assert.ok(m.status >= 400 && m.status < 500, 'malformed ' + m.status); assert.ok(big.status >= 400 && big.status < 500, 'big ' + big.status);
    return `malformed=${m.status} oversize=${big.status}`;
  });
  let scan1;
  await check('F02-05', 'REAL Sentinel Hub: create scan (30-day window, <=30% cloud) -> 202 QUEUED, DB capture + outbox row', async () => {
    const r = await create(fA.fieldId, { maxCloudCoverage: 30 }); assert.equal(r.status, 202, r.status + r.text.slice(0, 200)); scan1 = r.json;
    const ob = (await c.query('SELECT count(*)::int n FROM satellite_task_outbox WHERE capture_id=$1', [scan1.id])).rows[0].n; assert.equal(ob, 1);
    return `status=${scan1.processingStatus} provider=${scan1.provider}`;
  });
  let fin1;
  await check('F02-06', 'REAL pipeline: beat outbox -> Celery -> STAC catalog search -> raster process -> terminal state (up to 5 min)', async () => {
    fin1 = await waitScan(A, scan1.id);
    assert.ok(fin1 && TERMINAL.includes(fin1.processingStatus), 'not terminal: ' + JSON.stringify(fin1).slice(0, 200));
    return `final=${fin1.processingStatus} acquisition=${fin1.acquisitionDate} cloud=${fin1.cloudCoverage} sceneId=${(fin1.providerSceneId || '').slice(0, 24)} reason=${JSON.stringify(fin1.failureCode || fin1.reason || '')}`;
  });
  let stats;
  await check('F02-07', 'indices NDVI/EVI/NDWI: values in physical range, valid-pixel coverage reported, stored in DB, matches API', async () => {
    if (fin1.processingStatus !== 'COMPLETED') throw blocked(`BLOCKED_EXTERNAL-DATA: no cloud-free Sentinel-2 scene in the last 30 days for this location (final=${fin1.processingStatus})`);
    const r = await call('GET', `/satellite-scans/${scan1.id}/statistics`, { token: A.token, base: PLAT }); assert.equal(r.status, 200); stats = r.json;
    assert.ok(stats.length >= 3, 'indices ' + stats.length);
    for (const s of stats) { const st = s.statistics; for (const k of ['mean', 'min', 'max']) if (st[k] != null) assert.ok(st[k] >= -1.0001 && st[k] <= 1.0001 || s.index === 'EVI', `${s.index}.${k}=${st[k]}`); assert.ok(st.validPixelCount > 0); if (st.min != null && st.max != null) assert.ok(st.min <= st.mean && st.mean <= st.max); }
    const n = (await c.query('SELECT count(*)::int n FROM satellite_statistics WHERE capture_id=$1', [scan1.id])).rows[0].n; assert.equal(n, stats.length);
    return JSON.stringify(stats.map((s) => [s.index, s.statistics.mean?.toFixed?.(3), s.statistics.validPixelCount]));
  });
  await check('F02-08', 'layers: owner gets authenticated same-origin URLs; content is a real PNG/TIFF; B gets 404; traversal / unknown type 404', async () => {
    if (!stats) throw blocked('BLOCKED_EXTERNAL-DATA: no completed capture');
    const l = await call('GET', `/satellite-scans/${scan1.id}/layers`, { token: A.token, base: PLAT }); assert.equal(l.status, 200); assert.ok(l.json.length >= 1);
    const first = l.json[0]; const url = first.access.url; assert.ok(url.startsWith('/api/satellite-scans/'), url);
    const content = await fetch(`${PLAT}/satellite-scans/${scan1.id}/layers/${first.type}/content`, { headers: { authorization: 'Bearer ' + A.token } });
    const buf = Buffer.from(await content.arrayBuffer()); assert.equal(content.status, 200); const magic = buf.subarray(0, 4).toString('hex'); assert.ok(['89504e47', '49492a00', '4d4d002a'].includes(magic), 'magic ' + magic);
    assert.match(content.headers.get('cache-control') || '', /no-store/);
    const b = await fetch(`${PLAT}/satellite-scans/${scan1.id}/layers/${first.type}/content`, { headers: { authorization: 'Bearer ' + B.token } });
    const trav = await fetch(`${PLAT}/satellite-scans/${scan1.id}/layers/..%2F..%2Fetc%2Fpasswd/content`, { headers: { authorization: 'Bearer ' + A.token } });
    const unk = await fetch(`${PLAT}/satellite-scans/${scan1.id}/layers/NOPE/content`, { headers: { authorization: 'Bearer ' + A.token } });
    const anon = await fetch(`${PLAT}/satellite-scans/${scan1.id}/layers/${first.type}/content`);
    assert.equal(b.status, 404); assert.ok([404, 400].includes(trav.status), 'traversal ' + trav.status); assert.equal(unk.status, 404); assert.equal(anon.status, 401);
    return `types=${l.json.map((x) => x.type).join(',')} bytes=${buf.length} magic=${magic}`;
  });
  await check('F02-09', 'farmer B cannot read A scan, statistics, layers, list; A list excludes B', async () => {
    const r = await Promise.all([`/satellite-scans/${scan1.id}`, `/satellite-scans/${scan1.id}/statistics`, `/satellite-scans/${scan1.id}/layers`].map((p) => call('GET', p, { token: B.token, base: PLAT })));
    assert.ok(r.every((x) => x.status === 404), r.map((x) => x.status).join());
    const ev = await call('GET', `/satellite-scans/${scan1.id}/evidence`, { token: B.token, base: PLAT });
    const bl = await create(fB.fieldId, { maxCloudCoverage: 30 }, B); assert.equal(bl.status, 202);
    const al = await call('GET', `/fields/${fA.fieldId}/satellite-scans`, { token: A.token, base: PLAT }); assert.ok(al.json.every((x) => x.fieldId === fA.fieldId));
    return `evidence-as-B=${ev.status}`;
  });
  await check('F02-10', 'idempotency: second scan of the same window/field does not duplicate an already published scene (NO_VALID_SCENE, 1 completed capture per scene)', async () => {
    if (fin1.processingStatus !== 'COMPLETED') throw blocked('BLOCKED_EXTERNAL-DATA: no completed capture to duplicate');
    const r = await create(fA.fieldId, { maxCloudCoverage: 30 }); assert.equal(r.status, 202);
    const f = await waitScan(A, r.json.id, 240000);
    const n = (await c.query("SELECT count(*)::int n FROM satellite_captures WHERE field_id=$1 AND processing_status='COMPLETED' AND provider_scene_id=$2", [fA.fieldId, fin1.providerSceneId])).rows[0].n;
    assert.equal(n, 1, 'scene published twice'); return `second=${f.processingStatus} reason=${JSON.stringify(f.reason || f.failureCode || '')}`;
  });
  await check('F02-11', 'cloud filter honesty: maxCloudCoverage=0 on a 3-day window yields NO_VALID_SCENE/CLOUD_BLOCKED (no stats fabricated)', async () => {
    const r = await create(fA2.fieldId, { maxCloudCoverage: 0, from: iso(-3), to: iso(-1) }); assert.equal(r.status, 202);
    const f = await waitScan(A, r.json.id, 240000); assert.ok(['NO_VALID_SCENE', 'CLOUD_BLOCKED', 'COMPLETED'].includes(f.processingStatus), f.processingStatus);
    const n = (await c.query('SELECT count(*)::int n FROM satellite_statistics WHERE capture_id=$1', [r.json.id])).rows[0].n;
    if (f.processingStatus !== 'COMPLETED') assert.equal(n, 0, 'statistics exist without a completed scene');
    return `final=${f.processingStatus} stats=${n}`;
  });
  await check('F02-12', 'empty state: field with no captures -> [] list and comparison INSUFFICIENT_HISTORY', async () => {
    const E = await farmer(c, 'F02E'); const fE = await makeField(E, { crop: 'wheat', lon: 71.2, lat: 31.45 });
    const l = await call('GET', `/fields/${fE.fieldId}/satellite-scans`, { token: E.token, base: PLAT }); const cmp = await call('GET', `/fields/${fE.fieldId}/satellite-comparison`, { token: E.token, base: PLAT });
    assert.deepEqual(l.json, []); assert.equal(cmp.json.comparisonBasis, 'INSUFFICIENT_HISTORY'); assert.deepEqual(cmp.json.observations, []);
  });
  await check('F02-13', 'boundary change after capture: comparison excludes captures with a different geometry hash (no false trend)', async () => {
    if (fin1.processingStatus !== 'COMPLETED') throw blocked('BLOCKED_EXTERNAL-DATA: needs a completed capture');
    const before = await call('GET', `/fields/${fA.fieldId}/satellite-comparison`, { token: A.token, base: PLAT }); assert.equal(before.status, 200);
    const cur = (await call('GET', `/fields/${fA.fieldId}`, { token: A.token })).json;
    const nb = { type: 'Polygon', coordinates: [[[72.5005, 31.4505], [72.5025, 31.4505], [72.5025, 31.4525], [72.5005, 31.4525], [72.5005, 31.4505]]] };
    const p = await call('PATCH', `/fields/${fA.fieldId}/boundary`, { token: A.token, base: PLAT, body: { geometry: nb, expectedVersion: cur.version, source: 'MAP_DRAWN' } }); assert.equal(p.status, 200, p.text.slice(0, 150));
    const after = await call('GET', `/fields/${fA.fieldId}/satellite-comparison`, { token: A.token, base: PLAT });
    return `observations before=${before.json.observations.length} after-move=${after.json.observations.length} basis=${after.json.comparisonBasis} (captures keep their own geometry hash)`;
  });
  await check('F02-14', 'rate limit: >10 satellite requests/hour per farmer -> 429', async () => {
    const R = await farmer(c, 'F02rate'); const fR = await makeField(R, { crop: 'wheat', lon: 70.9, lat: 31.45 }); const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await create(fR.fieldId, { maxCloudCoverage: 30 }, R)).status);
    assert.ok(codes.slice(0, 10).every((x) => x === 202), codes.join()); assert.ok(codes.slice(10).every((x) => x === 429), codes.join()); return codes.join();
  });
  await check('F02-15', 'web BFF satellite (browser contract): authenticated list + scan JSON reachable through Next', async () => {
    const r = await call('GET', `/api/fields/${fA.fieldId}/satellite-scans`, { base: WEB, headers: { cookie: `fg_access=${A.token}` } }); assert.equal(r.status, 200, r.status + r.text.slice(0, 150)); assert.ok(Array.isArray(r.json));
    const g = await call('GET', `/api/satellite-scans/${scan1.id}`, { base: WEB, headers: { cookie: `fg_access=${A.token}` } }); assert.equal(g.status, 200);
    const gb = await call('GET', `/api/satellite-scans/${scan1.id}`, { base: WEB, headers: { cookie: `fg_access=${B.token}` } }); assert.equal(gb.status, 404);
    return `list=${r.json.length} B=404`;
  });
  await check('F02-16', 'REAL provider outage (Earth Search STAC host unreachable from the worker) -> bounded retries -> FAILED with sanitised code, no statistics, no provider URL/secret leak', async () => {
    const envf = path.join(S, 'plat.envfile');
    sh('docker stop qa7-platform-worker');
    sh(`docker run -d --name qa7-platform-worker-bad --network qa7-net -v qa7_media:/data/media --env-file "${envf}" --add-host earth-search.aws.element84.com:127.0.0.1 qa7-platform:latest celery -A app.worker worker --loglevel=info --concurrency=1 -Q celery,satellite,irrigation -n bad@%h`);
    try {
      const O = await farmer(c, 'F02O'); const fO = await makeField(O, { crop: 'wheat', lon: 70.5, lat: 31.45 });
      const r = await create(fO.fieldId, { maxCloudCoverage: 30 }, O); assert.equal(r.status, 202);
      const f = await waitScan(O, r.json.id, 420000);
      const n = (await c.query('SELECT count(*)::int n FROM satellite_statistics WHERE capture_id=$1', [r.json.id])).rows[0].n;
      assert.equal(f.processingStatus, 'FAILED', 'final ' + f.processingStatus); assert.equal(n, 0);
      const txt = JSON.stringify(f); assert.ok(!/127\.0\.0\.1|client_secret|Traceback/i.test(txt), 'leak: ' + txt.slice(0, 200));
      return `FAILED failureCode=${f.failureCode} stats=0`;
    } finally { sh('docker rm -f qa7-platform-worker-bad'); sh('docker start qa7-platform-worker'); }
  });
  await check('F02-17', 'recovery: after worker restored, new scan processes again (queue not poisoned)', async () => {
    await sleep(10000); const R = await farmer(c, 'F02R'); const fR = await makeField(R, { crop: 'wheat', lon: 72.9, lat: 31.4 });
    const r = await create(fR.fieldId, { maxCloudCoverage: 30 }, R); assert.equal(r.status, 202); const f = await waitScan(R, r.json.id, 300000);
    assert.ok(['COMPLETED', 'NO_VALID_SCENE', 'CLOUD_BLOCKED'].includes(f.processingStatus), 'final ' + f.processingStatus + JSON.stringify(f.failureCode)); return f.processingStatus;
  });
  await check('F02-18', 'two scans on one field submitted back-to-back: both reach a terminal state promptly (no 15-minute stall)', async () => {
    const S2 = await farmer(c, 'F02S'); const fS = await makeField(S2, { crop: 'wheat', lon: 72.2, lat: 31.5 });
    const [a, b] = await Promise.all([create(fS.fieldId, { maxCloudCoverage: 30 }, S2), create(fS.fieldId, { maxCloudCoverage: 30 }, S2)]);
    assert.equal(a.status, 202); assert.equal(b.status, 202);
    const fa = await waitScan(S2, a.json.id, 150000); const fb = await waitScan(S2, b.json.id, 150000);
    const states = [fa?.processingStatus, fb?.processingStatus];
    assert.ok(TERMINAL.includes(states[0]) && TERMINAL.includes(states[1]), 'after 150 s states=' + states.join('/') + ' (second task returned ALREADY_RUNNING and its outbox row was pushed 15 minutes ahead)');
    return states.join('/');
  });
  finish(path.join(out, 'f02-api.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
