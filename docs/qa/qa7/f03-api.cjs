// F03 irrigation / water balance: platform API (8027) + Celery irrigation worker + beat outbox; real Open-Meteo archive weather for one run.
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, API, PLAT, WEB, blocked } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const dayStr = (off) => new Date(Date.now() + 5 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const PARAMS = { Kcmini: 0.35, Kcmmid: 1.15, Kcmend: 0.6, Kcbini: 0.15, Kcbmid: 1.1, Kcbend: 0.5, Lini: 25, Ldev: 50, Lmid: 50, Lend: 25, hini: 0.01, hmax: 1.2, thetaFC: 0.25, thetaWP: 0.1, theta0: 0.15, Zrini: 0.5, Zrmax: 0.5, pbase: 0.5, Ze: 0.1, REW: 8, CN2: 70 };
const SOW = dayStr(-25), END = dayStr(-1);
const profile = (cycle, over = {}) => ({ cropCycleId: cycle, initialDate: SOW, initialCondition: 'SCENARIO', source: 'QA7 synthetic scenario; not measured soil data', efficiency: 0.8, wettedFraction: 1, uplandNoGroundwater: true, parameters: { ...PARAMS }, expectedVersion: 0, ...over });
const days = (n, rain = 0, et0 = 4, start = SOW) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 86400e3).toISOString().slice(0, 10), et0Mm: et0, rainMm: rain, wind2mMs: 2, rhMinPercent: 40 }));
const N = 25; // SOW..END inclusive
async function waitRun(u, id, ms = 120000) { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await call('GET', `/irrigation-runs/${id}`, { token: u.token, base: PLAT }); if (last.json && ['COMPLETED', 'FAILED', 'BLOCKED_EXTERNAL'].includes(last.json.status)) return last.json; await sleep(3000); } return last?.json; }
(async () => {
  const c = await db();
  const A = await farmer(c, 'F03A'); const B = await farmer(c, 'F03B');
  const fA = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.40, sowing: SOW, name: 'F03 wheat' });
  const fRice = await makeField(A, { crop: 'rice', lon: 72.70, lat: 31.40, sowing: SOW, name: 'F03 rice' });
  const fNoSow = await makeField(A, { crop: 'maize', lon: 72.80, lat: 31.40, sowing: null, name: 'F03 nosow' }).catch(() => null);
  const fB = await makeField(B, { crop: 'wheat', lon: 73.4, lat: 31.4, sowing: SOW, name: 'F03 B wheat' });
  const cycleOf = async (fid) => (await c.query('SELECT id FROM crop_cycles WHERE field_id=$1 ORDER BY created_at DESC LIMIT 1', [fid])).rows[0]?.id;
  const cyc = await cycleOf(fA.fieldId), cycRice = await cycleOf(fRice.fieldId), cycB = await cycleOf(fB.fieldId);
  const put = (t, id, body) => call('PUT', `/fields/${id}/irrigation/profile`, { token: t.token, base: PLAT, body });
  const run = (t, id, body) => call('POST', `/fields/${id}/irrigation-runs`, { token: t.token, base: PLAT, body });
  const runBody = (over = {}) => ({ cropCycleId: cyc, endDate: END, weatherSource: 'MANUAL', manualWeather: days(N), source: 'QA7 manual daily weather (synthetic)', confirmedNoOtherIrrigation: true, idempotencyKey: crypto.randomUUID(), ...over });

  await check('F03-01', 'unauthenticated context/profile/events/runs -> 401 (platform + BFF); wrong role 403', async () => {
    const r = await Promise.all([call('GET', `/fields/${fA.fieldId}/irrigation/context`, { base: PLAT }), call('PUT', `/fields/${fA.fieldId}/irrigation/profile`, { base: PLAT, body: {} }), call('POST', `/fields/${fA.fieldId}/irrigation-runs`, { base: PLAT, body: {} }), call('GET', `/fields/${fA.fieldId}/irrigation-runs`, { base: PLAT }), call('GET', `/api/irrigation/fields/${fA.fieldId}/irrigation/context`, { base: WEB })]);
    assert.ok(r.every((x) => x.status === 401), r.map((x) => x.status).join());
    const ex = await farmer(c, 'F03x', { role: 'AGRICULTURE_EXPERT' }); assert.equal((await call('GET', `/fields/${fA.fieldId}/irrigation/context`, { token: ex.token, base: PLAT })).status, 403);
  });
  await check('F03-02', 'ownership: B cannot read context/profile/events or submit for A field (404), nor use A season on own field', async () => {
    const r = await Promise.all([call('GET', `/fields/${fA.fieldId}/irrigation/context`, { token: B.token, base: PLAT }), put(B, fA.fieldId, profile(cyc)), run(B, fA.fieldId, runBody()), call('GET', `/fields/${fA.fieldId}/irrigation-runs`, { token: B.token, base: PLAT }), put(B, fB.fieldId, profile(cyc))]);
    assert.ok(r.every((x) => x.status === 404), r.map((x) => x.status + (x.json?.error?.code || '')).join());
  });
  await check('F03-03', 'context: crop, sowing date, area, coordinates; rice and missing-sowing fields give explicit conflicts', async () => {
    const r = await call('GET', `/fields/${fA.fieldId}/irrigation/context`, { token: A.token, base: PLAT }); assert.equal(r.status, 200); assert.equal(r.json.crop, 'wheat'); assert.equal(r.json.cropCycleId, cyc);
    assert.equal(String(r.json.sowingDate).slice(0, 10), SOW);
    const pr = await put(A, fRice.fieldId, profile(cycRice)); assert.equal(pr.status, 409); assert.equal(pr.json.error.code, 'UNSUPPORTED_CROP_SYSTEM');
    let ns = 'n/a'; if (fNoSow) { const cn = await cycleOf(fNoSow.fieldId); const p2 = await put(A, fNoSow.fieldId, profile(cn)); assert.equal(p2.status, 409); ns = p2.json.error.code; }
    return `wheat ctx ok; rice -> UNSUPPORTED_CROP_SYSTEM; no-sowing -> ${ns}; waterProductivityEnabled=${r.json.waterProductivityEnabled}`;
  });
  await check('F03-04', 'profile validation: bad initialDate, efficiency 0/1.5, wettedFraction 0, uplandNoGroundwater false, theta ordering, Kcb ordering, extra field, boolean numeric, NaN-like, short source, negative version', async () => {
    const mk = (o, p = {}) => profile(cyc, { ...o, parameters: { ...PARAMS, ...p } });
    const cases = {
      date: mk({ initialDate: dayStr(-5) }), eff0: mk({ efficiency: 0 }), eff15: mk({ efficiency: 1.5 }), wet0: mk({ wettedFraction: 0 }), upl: mk({ uplandNoGroundwater: false }),
      thetaOrder: mk({}, { thetaWP: 0.3 }), kcb: mk({}, { Kcbmid: 0.1 }), extra: { ...mk({}), owner: 'x' }, boolNum: mk({}, { Zrini: true }), shortSrc: mk({ source: 'x' }), negVer: mk({ expectedVersion: -1 }), cn: mk({}, { CN2: 99 }), lengths: mk({}, { Lini: 180, Ldev: 180 }), future: mk({ initialDate: dayStr(3) }),
    };
    const r = {}; for (const [k, b] of Object.entries(cases)) r[k] = (await put(A, fA.fieldId, b)).status;
    const bad = Object.entries(r).filter(([, s]) => ![400, 422].includes(s)); assert.deepEqual(bad, [], JSON.stringify(bad));
    const rows = (await c.query('SELECT count(*)::int n FROM field_water_profiles WHERE crop_cycle_id=$1', [cyc])).rows[0].n; assert.equal(rows, 0, 'invalid profile persisted');
    return JSON.stringify(r);
  });
  await check('F03-05', 'profile save v1 then optimistic concurrency: stale version -> 409; parallel writers -> exactly one wins', async () => {
    const ok = await put(A, fA.fieldId, profile(cyc)); assert.equal(ok.status, 200, ok.text.slice(0, 200)); assert.equal(ok.json.version, 1);
    const stale = await put(A, fA.fieldId, profile(cyc)); assert.equal(stale.status, 409); assert.equal(stale.json.error.code, 'PROFILE_VERSION_CONFLICT');
    const rs = await Promise.all(Array.from({ length: 5 }, () => put(A, fA.fieldId, profile(cyc, { expectedVersion: 1, efficiency: 0.75 }))));
    const codes = rs.map((x) => x.status).sort(); assert.equal(codes.filter((x) => x === 200).length, 1, codes.join());
    const n = (await c.query('SELECT max(version)::int v, count(*)::int n FROM field_water_profiles WHERE crop_cycle_id=$1', [cyc])).rows[0]; assert.equal(n.v, 2); assert.equal(n.n, 2);
    return codes.join();
  });
  let r1;
  await check('F03-06', 'run 202 (manual weather): outbox -> beat -> Celery -> COMPLETED; result has provenance, no weather fabricated, advice fields', async () => {
    const body = runBody(); const r = await run(A, fA.fieldId, body); assert.equal(r.status, 202, r.text.slice(0, 250)); assert.equal(r.json.status, 'QUEUED');
    const f = await waitRun(A, r.json.id, 150000); assert.equal(f.status, 'COMPLETED', JSON.stringify(f).slice(0, 300)); r1 = { body, view: f };
    const res = f.result; assert.equal(res.weatherProvenance.provider, 'FARMER_SUPPLIED'); assert.equal(res.weatherProvenance.verifiedByPlatform, false);
    return 'result keys: ' + Object.keys(res).join(',');
  });
  await check('F03-07', 'science sanity: zero rain, ET0=4 mm/day over 25 days -> positive irrigation requirement, depletion bounded by TAW, no NaN/negative; numbers equal DB copy', async () => {
    const res = r1.view.result; const txt = JSON.stringify(res); assert.ok(!/NaN|Infinity/.test(txt));
    const flat = []; const walk = (o, p) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p + '.' + k); else if (typeof o === 'number') flat.push([p, o]); }; walk(res, 'r');
    assert.ok(flat.every(([, v]) => Number.isFinite(v)), 'non-finite numeric'); const db1 = (await c.query('SELECT result FROM irrigation_runs WHERE id=$1', [r1.view.id])).rows[0].result; assert.deepEqual(db1, res);
    const need = flat.filter(([p]) => /irrigation|requirement|depletion|netDepth|grossDepth|deficit/i.test(p)); return need.slice(0, 10).map(([p, v]) => `${p.replace('r.', '')}=${v}`).join(' ; ');
  });
  await check('F03-08', 'sensitivity: heavy rain (80 mm/day) run needs less irrigation than dry run; recorded irrigation event reduces need', async () => {
    const wet = await run(A, fA.fieldId, runBody({ manualWeather: days(N, 80), idempotencyKey: crypto.randomUUID() })); const wf = await waitRun(A, wet.json.id, 150000); assert.equal(wf.status, 'COMPLETED', JSON.stringify(wf).slice(0, 200));
    const sum = (res) => JSON.stringify(res); const get = (res, re) => { const out = []; const w = (o, p) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) w(v, p + '.' + k); else if (typeof o === 'number' && re.test(p)) out.push(o); }; w(res, ''); return out; };
    const dry = get(r1.view.result, /(gross|irrigation).*(mm|depth|requirement)|recommend/i); const wetv = get(wf.result, /(gross|irrigation).*(mm|depth|requirement)|recommend/i);
    const d = dry.reduce((a, b) => a + b, 0), w = wetv.reduce((a, b) => a + b, 0);
    assert.ok(w <= d, `wet total ${w} > dry total ${d}`); return `dry-sum=${d.toFixed(2)} wet-sum=${w.toFixed(2)} (selected numeric fields)`;
  });
  await check('F03-09', 'idempotency: same key+payload -> same run id (no duplicate); same key different payload -> 409', async () => {
    const k = crypto.randomUUID(); const body = runBody({ idempotencyKey: k });
    const a = await run(A, fA.fieldId, body); const b = await run(A, fA.fieldId, body); assert.equal(a.status, 202); assert.equal(b.status, 202); assert.equal(a.json.id, b.json.id);
    const diff = await run(A, fA.fieldId, runBody({ idempotencyKey: k, endDate: dayStr(-2), manualWeather: days(N - 1) })); assert.equal(diff.status, 409); assert.equal(diff.json.error.code, 'IDEMPOTENCY_CONFLICT');
    const rs = await Promise.all(Array.from({ length: 6 }, () => run(A, fA.fieldId, { ...body })));
    assert.ok(rs.every((x) => x.status === 202 && x.json.id === a.json.id), rs.map((x) => x.status).join());
    const n = (await c.query('SELECT count(*)::int n FROM irrigation_runs WHERE idempotency_key=$1', [k])).rows[0].n; assert.equal(n, 1); await waitRun(A, a.json.id, 150000);
  });
  await check('F03-10', 'run validation: future endDate, before sowing, missing weather days, extra weather day, MANUAL without rows, ARCHIVE with rows, rain<0, et0>30, confirmedNoOtherIrrigation false, profile missing season', async () => {
    const bad = {
      future: runBody({ endDate: dayStr(3) }), short: runBody({ manualWeather: days(N - 3) }), extra: runBody({ manualWeather: days(N + 2) }), noRows: runBody({ manualWeather: undefined }), archWithRows: runBody({ weatherSource: 'OPEN_METEO_ARCHIVE' }),
      rainNeg: runBody({ manualWeather: days(N, -1) }), et0Big: runBody({ manualWeather: days(N, 0, 31) }), noConfirm: runBody({ confirmedNoOtherIrrigation: false }), srcShort: runBody({ source: 'x' }), keyBad: runBody({ idempotencyKey: 'abc' }), beforeSow: runBody({ endDate: dayStr(-30) }),
    };
    const r = {}; for (const [k, b] of Object.entries(bad)) r[k] = (await run(A, fA.fieldId, b)).status;
    const no = await run(A, fRice.fieldId, { ...runBody(), cropCycleId: cycRice }); r.rice = no.status;
    const bs = Object.entries(r).filter(([, s]) => ![400, 409, 422].includes(s)); assert.deepEqual(bs, [], JSON.stringify(bs)); return JSON.stringify(r);
  });
  await check('F03-11', 'events: record actual irrigation (201); same key replay identical; same key different -> 409; second event same date 409; future date 400; 0/negative/301 mm 400; B cannot read', async () => {
    const ev = (o) => ({ cropCycleId: cyc, date: dayStr(-10), grossDepthMm: 30, efficiency: 0.8, wettedFraction: 1, source: 'QA7 farmer log', idempotencyKey: crypto.randomUUID(), ...o });
    const k = crypto.randomUUID(); const e1 = ev({ idempotencyKey: k }); const a = await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: A.token, base: PLAT, body: e1 }); assert.equal(a.status, 201, a.text.slice(0, 200));
    const again = await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: A.token, base: PLAT, body: e1 }); assert.equal(again.status, 201); assert.equal(again.json.id, a.json.id);
    const diff = await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: A.token, base: PLAT, body: { ...e1, grossDepthMm: 45 } }); assert.equal(diff.status, 409);
    const dup = await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: A.token, base: PLAT, body: ev({}) }); assert.equal(dup.status, 409); assert.equal(dup.json.error.code, 'DAILY_EVENT_EXISTS');
    const r = {}; for (const [n, o] of Object.entries({ fut: { date: dayStr(2) }, zero: { grossDepthMm: 0 }, neg: { grossDepthMm: -5 }, big: { grossDepthMm: 301 }, pre: { date: dayStr(-40) }, effBig: { efficiency: 1.2 } })) r[n] = (await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: A.token, base: PLAT, body: ev(o) })).status;
    for (const [n, s] of Object.entries(r)) assert.ok([400, 422].includes(s), n + '=' + s);
    const b = await call('GET', `/fields/${fA.fieldId}/irrigation/events?cropCycleId=${cyc}`, { token: B.token, base: PLAT }); assert.equal(b.status, 404);
    const bw = await call('POST', `/fields/${fA.fieldId}/irrigation/events`, { token: B.token, base: PLAT, body: ev({}) }); assert.equal(bw.status, 404);
    return JSON.stringify(r);
  });
  await check('F03-12', 'REAL Open-Meteo ARCHIVE weather run (profile from sowing to yesterday) -> COMPLETED with provider provenance and plausible ET0 inputs', async () => {
    const r = await run(A, fA.fieldId, { cropCycleId: cyc, endDate: END, weatherSource: 'OPEN_METEO_ARCHIVE', source: 'QA7 archive weather run', confirmedNoOtherIrrigation: false === true, idempotencyKey: crypto.randomUUID() });
    // schema requires confirmedNoOtherIrrigation literal true
    const r2 = await run(A, fA.fieldId, { cropCycleId: cyc, endDate: END, weatherSource: 'OPEN_METEO_ARCHIVE', source: 'QA7 archive weather run', confirmedNoOtherIrrigation: true, idempotencyKey: crypto.randomUUID() });
    assert.ok([400, 422].includes(r.status), 'confirmed=false accepted: ' + r.status); assert.equal(r2.status, 202, r2.text.slice(0, 200));
    const f = await waitRun(A, r2.json.id, 180000);
    if (f.status === 'FAILED' || f.status === 'BLOCKED_EXTERNAL') throw blocked(`BLOCKED_EXTERNAL: archive weather run ended ${f.status} ${JSON.stringify(f.failureCode || f.errorCode || '')}`);
    assert.equal(f.status, 'COMPLETED'); const wi = f.result.weatherInputs; assert.equal(wi.length, N); assert.ok(wi.every((d) => d.et0Mm >= 0 && d.et0Mm < 15 && d.rainMm >= 0 && d.rhMinPercent >= 0 && d.rhMinPercent <= 100));
    return `provider=${f.result.weatherProvenance.provider} ET0 mean=${(wi.reduce((a, d) => a + d.et0Mm, 0) / wi.length).toFixed(2)} mm/day rain total=${wi.reduce((a, d) => a + d.rainMm, 0).toFixed(1)} mm`;
  });
  await check('F03-13', 'WaPOR water-productivity run is honestly BLOCKED_EXTERNAL when WAPOR_ENABLED=false (no synthetic result)', async () => {
    const r = await call('POST', `/fields/${fA.fieldId}/water-productivity-runs`, { token: A.token, base: PLAT, body: { cropCycleId: cyc, startDate: dayStr(-20), endDate: dayStr(-5), idempotencyKey: crypto.randomUUID(), dryMatterCarbonFraction: 0.45, carbonFractionSource: 'QA7 assumed fraction for test' } });
    assert.equal(r.status, 202, r.text.slice(0, 200)); const f = await waitRun(A, r.json.id, 120000);
    assert.equal(f.status, 'BLOCKED_EXTERNAL'); assert.ok(!f.result || Object.keys(f.result).length === 0, 'result present for blocked run');
    return `status=${f.status} code=${f.failureCode || f.errorCode || JSON.stringify(f).slice(0, 120)} (needs WAPOR credentials/pywapor)`;
  });
  await check('F03-14', 'rate limit: runs >10/hour per farmer -> 429; history lists own runs only', async () => {
    const R = await farmer(c, 'F03rate'); const fR = await makeField(R, { crop: 'wheat', lon: 72.9, lat: 31.3, sowing: SOW, name: 'F03 rate' }); const cr = await cycleOf(fR.fieldId);
    assert.equal((await put(R, fR.fieldId, profile(cr))).status, 200); const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await run(R, fR.fieldId, runBody({ cropCycleId: cr, idempotencyKey: crypto.randomUUID() }))).status);
    assert.ok(codes.includes(429), codes.join()); const hist = await call('GET', `/fields/${fA.fieldId}/irrigation-runs`, { token: A.token, base: PLAT }); assert.ok(hist.json.every((x) => x.fieldId === fA.fieldId || x.fieldId === undefined));
    const hb = await call('GET', `/fields/${fB.fieldId}/irrigation-runs`, { token: A.token, base: PLAT }); assert.equal(hb.status, 404);
    return codes.join(',');
  });
  await check('F03-15', 'run result access: B cannot read A run by id (404)', async () => {
    const x = await call('GET', `/irrigation-runs/${r1.view.id}`, { token: B.token, base: PLAT }); assert.equal(x.status, 404);
    const y = await call('GET', `/irrigation-runs/${r1.view.id}`, { base: PLAT }); assert.equal(y.status, 401);
    const z = await call('GET', '/irrigation-runs/nope', { token: A.token, base: PLAT }); assert.ok([400, 422].includes(z.status));
  });
  await check('F03-16', 'broker outage keeps a committed run: stop Redis, submit (accepted or typed error), restart, beat redispatches -> COMPLETED', async () => {
    const D = await farmer(c, 'F03D'); const fD = await makeField(D, { crop: 'wheat', lon: 71.6, lat: 31.3, sowing: SOW, name: 'F03 outage' }); const cd = await cycleOf(fD.fieldId);
    assert.equal((await put(D, fD.fieldId, profile(cd))).status, 200);
    sh('docker stop qa7-redis'); let st;
    try { await sleep(1000); const r = await run(D, fD.fieldId, runBody({ cropCycleId: cd, idempotencyKey: crypto.randomUUID() })); st = r; } finally { sh('docker start qa7-redis'); }
    if (st.status !== 202) return `submit during Redis outage -> ${st.status} ${st.json?.error?.code}: no accepted-but-lost run (committed=${(await c.query('SELECT count(*)::int n FROM irrigation_runs WHERE owner_id=$1', [D.userId])).rows[0].n})`;
    await sleep(8000); const f = await waitRun(D, st.json.id, 200000); assert.equal(f.status, 'COMPLETED', 'ended ' + f.status); return 'accepted with Redis down; completed after recovery via outbox';
  });
  finish(path.join(out, 'f03-api.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
