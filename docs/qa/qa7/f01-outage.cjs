// F01 platform (FastAPI + Celery) provider outage / timeout / worker-crash behaviour. Real Roboflow when reachable.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, PLAT, API } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const REAL = fs.readFileSync(path.resolve(__dirname, '../../../public/expert-case-leaf-early.png'));
const hosts = (add) => sh(`docker exec -u root qa7-platform-worker sh -c "${add ? 'echo ' + add + ' >> /etc/hosts' : 'grep -v roboflow.com /etc/hosts > /tmp/h; cat /tmp/h > /etc/hosts'}"`);
async function upload(u, buf) {
  const pre = await call('POST', '/uploads/presign', { token: u.token, body: { fileName: 'leaf.png', contentType: 'image/png', sizeBytes: buf.length, purpose: 'crop-scan' } });
  const put = await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: buf });
  const done = await call('POST', '/uploads/complete', { token: u.token, body: { mediaId: pre.json.media.id } });
  assert.equal(done.status, 200, 'upload complete ' + done.status + done.text.slice(0, 100)); return pre.json.media.id;
}
async function newScan(u, fieldId) {
  const s = await call('POST', '/crop-scans', { token: u.token, base: PLAT, body: { fieldId } });
  const m = await upload(u, REAL);
  await call('POST', `/crop-scans/${s.json.id}/images`, { token: u.token, base: PLAT, body: { mediaId: m, category: 'LEAF_FRONT' } });
  return s.json.id;
}
const term = async (u, id, ms = 120000) => { const end = Date.now() + ms; let l; while (Date.now() < end) { l = await call('GET', `/crop-scans/${id}`, { token: u.token, base: PLAT }); if (l.json && !['CREATED', 'UPLOADING', 'IMAGE_VALIDATION', 'ANALYSING'].includes(l.json.status)) return l.json; await sleep(2000); } return l.json; };
(async () => {
  const c = await db();
  const A = await farmer(c, 'F01O'); const f = await makeField(A, { crop: 'wheat', lon: 72.5, lat: 32.2 });
  let id;
  await check('F01-40', 'provider unreachable (connection refused): bounded retries -> NEEDS_FOLLOW_UP VISION_PROVIDER_UNAVAILABLE, no prediction/diagnosis, ai_runs FAILED', async () => {
    id = await newScan(A, f.fieldId); hosts('127.0.0.1 serverless.roboflow.com');
    try {
      const t0 = Date.now(); await call('POST', `/crop-scans/${id}/analyse`, { token: A.token, base: PLAT }); const fin = await term(A, id, 90000); const dt = Date.now() - t0;
      const n = (await c.query('SELECT (SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p,(SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d,(SELECT count(*) FROM ai_runs WHERE source_id=$1 AND status=\'FAILED\')::int f', [id])).rows[0];
      assert.equal(fin.status, 'NEEDS_FOLLOW_UP'); assert.equal(fin.failureCode, 'VISION_PROVIDER_UNAVAILABLE'); assert.deepEqual([n.p, n.d], [0, 0]);
      return `after ${dt} ms; failure=${fin.failureCode}; ai_runs FAILED rows=${n.f}`;
    } finally { hosts(null); }
  });
  await check('F01-41', 'recovery: after provider returns, re-analyse the same scan -> DIAGNOSED with exactly one prediction (retry is idempotent; no duplicate)', async () => {
    const r = await call('POST', `/crop-scans/${id}/analyse`, { token: A.token, base: PLAT }); const fin = await term(A, id, 90000);
    const n = (await c.query('SELECT (SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p,(SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d', [id])).rows[0];
    assert.ok(['DIAGNOSED', 'EXPERT_REVIEW', 'NEEDS_FOLLOW_UP'].includes(fin.status)); assert.equal(n.p, 1, JSON.stringify(n)); assert.equal(n.d, 1);
    return `analyse http=${r.status}; final=${fin.status}/${fin.failureCode || fin.disposition}; rows=${JSON.stringify(n)}`;
  });
  await check('F01-42', 'provider timeout (blackhole address): VISION_PROVIDER_TIMEOUT within bounded time, no prediction', async () => {
    const id2 = await newScan(A, f.fieldId); hosts('10.255.255.1 serverless.roboflow.com');
    try { const t0 = Date.now(); await call('POST', `/crop-scans/${id2}/analyse`, { token: A.token, base: PLAT }); const fin = await term(A, id2, 150000); const dt = Date.now() - t0;
      const n = (await c.query('SELECT count(*)::int n FROM model_predictions WHERE scan_id=$1', [id2])).rows[0].n; assert.equal(n, 0);
      assert.ok(['VISION_PROVIDER_TIMEOUT', 'VISION_PROVIDER_UNAVAILABLE'].includes(fin.failureCode), 'code ' + fin.failureCode + ' status ' + fin.status);
      return `${fin.failureCode} after ${dt} ms`; } finally { hosts(null); }
  });
  await check('F01-43', 'worker killed mid-analysis (docker kill) then restarted: scan must reach a terminal state within 4 minutes (no permanently stuck ANALYSING)', async () => {
    const id3 = await newScan(A, f.fieldId); hosts('10.255.255.1 serverless.roboflow.com'); await call('POST', `/crop-scans/${id3}/analyse`, { token: A.token, base: PLAT }); await sleep(5000);
    const mid = (await call('GET', `/crop-scans/${id3}`, { token: A.token, base: PLAT })).json.status; sh('docker kill qa7-platform-worker'); await sleep(2000); sh('docker start qa7-platform-worker');
    const fin = await term(A, id3, 240000); const redis = sh("docker exec qa7-redis redis-cli -n 2 llen celery").trim(); const unacked = sh("docker exec qa7-redis redis-cli -n 2 hlen unacked").trim();
    assert.ok(mid === 'ANALYSING' || mid === 'IMAGE_VALIDATION', 'kill was not mid-flight: ' + mid); assert.ok(!['IMAGE_VALIDATION', 'ANALYSING'].includes(fin.status), `scan still '${fin.status}' 4 min after the worker crash (state at kill: ${mid}); broker queue=${redis} unacked=${unacked}; Celery redis visibility timeout default is 1 hour and there is no database lease/recovery`);
    return `state at kill=${mid}; final=${fin.status}`;
  });
  finish(path.join(out, 'f01-outage.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
