// F03 extras: independent re-fetch of archive weather vs stored run inputs; missing-sowing conflict via real data edit.
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, crypto, PLAT } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
(async () => {
  const c = await db();
  await check('F03-17', 'archive run inputs equal an independent Open-Meteo archive request (same lat/lon/dates) within 0.05 mm', async () => {
    const r = (await c.query("SELECT result, inputs FROM irrigation_runs WHERE kind='IRRIGATION' AND status='COMPLETED' AND result->'weatherProvenance'->>'provider'='OPEN_METEO_ARCHIVE' ORDER BY created_at DESC LIMIT 1")).rows[0];
    assert.ok(r, 'no archive run found (run f03-api.cjs first)');
    const ctx = r.inputs.context; const days = r.result.weatherInputs; const start = days[0].date, end = days[days.length - 1].date;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${ctx.latitude}&longitude=${ctx.longitude}&start_date=${start}&end_date=${end}&daily=et0_fao_evapotranspiration,precipitation_sum&timezone=Asia%2FKarachi`;
    const j = await (await fetch(url)).json(); assert.ok(j.daily, JSON.stringify(j).slice(0, 150));
    let maxdE = 0, maxdR = 0; days.forEach((d, i) => { assert.equal(d.date, j.daily.time[i]); maxdE = Math.max(maxdE, Math.abs(d.et0Mm - j.daily.et0_fao_evapotranspiration[i])); maxdR = Math.max(maxdR, Math.abs(d.rainMm - j.daily.precipitation_sum[i])); });
    assert.ok(maxdE < 0.05 && maxdR < 0.05, `max ET0 diff ${maxdE}, rain diff ${maxdR}`);
    return `${days.length} days ${start}..${end}; max|dET0|=${maxdE.toFixed(4)} max|dRain|=${maxdR.toFixed(4)}`;
  });
  await check('F03-18', 'season without sowing date -> 409 SEASON_INPUTS_REQUIRED on profile save (no row written)', async () => {
    const A = await farmer(c, 'F03X'); const f = await makeField(A, { crop: 'wheat', lon: 72.5, lat: 31.2 });
    const cyc = (await c.query('SELECT id FROM crop_cycles WHERE field_id=$1', [f.fieldId])).rows[0].id;
    await c.query('UPDATE crop_cycles SET sowing_date=NULL WHERE id=$1', [cyc]);
    const P = { cropCycleId: cyc, initialDate: '2026-09-01', initialCondition: 'SCENARIO', source: 'QA7 synthetic scenario; no sowing', efficiency: 0.8, wettedFraction: 1, uplandNoGroundwater: true, expectedVersion: 0, parameters: { Kcmini: 0.35, Kcmmid: 1.15, Kcmend: 0.6, Kcbini: 0.15, Kcbmid: 1.1, Kcbend: 0.5, Lini: 25, Ldev: 50, Lmid: 50, Lend: 25, hini: 0.01, hmax: 1.2, thetaFC: 0.25, thetaWP: 0.1, theta0: 0.15, Zrini: 0.5, Zrmax: 0.5, pbase: 0.5, Ze: 0.1, REW: 8, CN2: 70 } };
    const r = await call('PUT', `/fields/${f.fieldId}/irrigation/profile`, { token: A.token, base: PLAT, body: P }); assert.equal(r.status, 409, r.status + r.text.slice(0, 150)); assert.equal(r.json.error.code, 'SEASON_INPUTS_REQUIRED');
    assert.equal((await c.query('SELECT count(*)::int n FROM field_water_profiles WHERE crop_cycle_id=$1', [cyc])).rows[0].n, 0);
  });
  await check('F03-19', 'two seasons on one field: B-owned cycle id cannot be used on A field; deleted season rejected', async () => {
    const A = await farmer(c, 'F03Y'); const f = await makeField(A, { crop: 'wheat', lon: 72.4, lat: 31.2 });
    const cyc = (await c.query('SELECT id FROM crop_cycles WHERE field_id=$1', [f.fieldId])).rows[0].id;
    await c.query('UPDATE crop_cycles SET deleted_at=now() WHERE id=$1', [cyc]);
    const r = await call('GET', `/fields/${f.fieldId}/irrigation/profile?cropCycleId=${cyc}`, { token: A.token, base: PLAT }); assert.equal(r.status, 404, r.status + r.text.slice(0, 100));
  });
  finish(path.join(out, 'f03-extra.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
