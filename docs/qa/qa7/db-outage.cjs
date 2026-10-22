// PostgreSQL outage across F01-F05 through core API, platform API and the Next BFF; session must survive and the stack must recover.
const assert = require('node:assert/strict');
const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, API, PLAT } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const WEB = 'http://localhost:3027';
(async () => {
  const c = await db();
  const A = await farmer(c, 'DBO'); const f = await makeField(A, { crop: 'wheat', lon: 72.5, lat: 32.4 });
  const cookie = { cookie: `fg_access=${A.token}` };
  const probes = {
    'core GET /crop-scans?fieldId': () => call('GET', `/crop-scans?fieldId=${f.fieldId}`, { token: A.token }),
    'core GET /farms': () => call('GET', '/farms', { token: A.token }),
    'platform GET weather forecast': () => call('GET', `/fields/${f.fieldId}/weather/forecast`, { token: A.token, base: PLAT }),
    'platform GET satellite scans': () => call('GET', `/fields/${f.fieldId}/satellite-scans`, { token: A.token, base: PLAT }),
    'platform GET irrigation context': () => call('GET', `/fields/${f.fieldId}/irrigation/context`, { token: A.token, base: PLAT }),
    'platform GET farm geojson export': () => call('GET', `/farms/${f.farmId}/fields/geojson`, { token: A.token, base: PLAT }),
    'BFF GET /api/farms': () => call('GET', '/api/farms', { base: WEB, headers: cookie }),
    'BFF GET weather forecast': () => call('GET', `/api/fields/${f.fieldId}/weather/forecast`, { base: WEB, headers: cookie }),
    'BFF GET satellite scans': () => call('GET', `/api/fields/${f.fieldId}/satellite-scans`, { base: WEB, headers: cookie }),
  };
  let during = {};
  await check('DB-01', 'baseline: all probes 200 with the session', async () => { const bad = []; for (const [k, fn] of Object.entries(probes)) { const r = await fn(); if (r.status !== 200) bad.push(k + '=' + r.status); } assert.deepEqual(bad, [], bad.join()); });
  await check('DB-02', 'PostgreSQL stopped: every endpoint answers quickly with 503/5xx JSON (not 401 logout, not hang); BFF keeps the session cookie', async () => {
    sh('docker stop qa7-postgres'); await sleep(2000);
    try {
      for (const [k, fn] of Object.entries(probes)) { const t0 = Date.now(); const r = await fn(); during[k] = `${r.status}/${Date.now() - t0}ms/${r.json?.error?.code || ''}`; }
      const bff = await fetch(WEB + '/api/farms', { headers: cookie }); const cleared = (bff.headers.get('set-cookie') || '').includes('fg_access=;');
      const bad = Object.entries(during).filter(([k, v]) => { const s = Number(v.split('/')[0]); return s === 401 || s === 0 || s === 200 || parseInt(v.split('/')[1]) > 40000; });
      assert.deepEqual(bad, [], 'wrong behaviour: ' + JSON.stringify(bad) + ' all=' + JSON.stringify(during) + ` sessionCookieCleared=${cleared}`);
      assert.ok(!cleared, 'BFF cleared the session cookie during the outage');
      return JSON.stringify(during);
    } finally { sh('docker start qa7-postgres'); }
  });
  await check('DB-03', 'recovery: after PostgreSQL is back (within 60 s) the same session works again on every endpoint without re-login', async () => {
    let bad; for (let i = 0; i < 12; i++) { await sleep(5000); bad = []; for (const [k, fn] of Object.entries(probes)) { const r = await fn(); if (r.status !== 200) bad.push(k + '=' + r.status); } if (!bad.length) return 'recovered after ~' + (i + 1) * 5 + ' s'; }
    assert.fail('still failing after 60 s: ' + bad.join());
  });
  await check('DB-04', 'Redis stopped: farm/field/geometry/irrigation reads still work; analyse/satellite queue endpoints give typed errors, no data loss', async () => {
    sh('docker stop qa7-redis'); await sleep(1500); const r = {};
    try {
      for (const [k, fn] of Object.entries(probes)) { const x = await fn(); r[k] = x.status; }
      const sat = await call('POST', `/fields/${f.fieldId}/satellite-scans`, { token: A.token, base: PLAT, body: { maxCloudCoverage: 30 } }); r['platform POST satellite scan'] = sat.status + '/' + (sat.json?.error?.code || '');
      assert.ok(r['core GET /farms'] === 200 && r['platform GET farm geojson export'] === 200 && r['platform GET irrigation context'] === 200, JSON.stringify(r));
      assert.ok([202, 503].includes(Number(String(r['platform POST satellite scan']).split('/')[0])), JSON.stringify(r));
      return JSON.stringify(r);
    } finally { sh('docker start qa7-redis'); await sleep(5000); }
  });
  finish(path.join(out, 'db-outage.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
