// F01 core path: Redis outage during analyse (atomicity). F02 legacy core path with Sentinel Hub credentials (real provider).
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, crypto, API, PLAT, blocked } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const REAL = fs.readFileSync(path.resolve(__dirname, '../../../public/expert-case-leaf-early.png'));
async function upload(u, buf) {
  const pre = await call('POST', '/uploads/presign', { token: u.token, body: { fileName: 'leaf.png', contentType: 'image/png', sizeBytes: buf.length, purpose: 'crop-scan' } });
  await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: buf });
  const done = await call('POST', '/uploads/complete', { token: u.token, body: { mediaId: pre.json.media.id } }); assert.equal(done.status, 200); return pre.json.media.id;
}
(async () => {
  const c = await db();
  const A = await farmer(c, 'F01R'); const f = await makeField(A, { crop: 'wheat', lon: 72.5, lat: 32.8 });
  await check('F01-27', 'core analyse while Redis is down: the failure must not leave the scan stuck in IMAGE_VALIDATION with no job (retry after recovery must work)', async () => {
    const s = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: f.fieldId } }); const m = await upload(A, REAL);
    await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: m, category: 'LEAF_FRONT' } });
    sh('docker stop qa7-redis'); let r;
    try { await sleep(1500); r = await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: A.token, timeout: 30000 }); } finally { sh('docker start qa7-redis'); await sleep(6000); }
    const st = (await c.query('SELECT status FROM crop_scans WHERE id=$1', [s.json.id])).rows[0].status;
    const retry = await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: A.token });
    assert.ok(r.status !== 0, `analyse request hung for 30 s while Redis was down (client timeout, no fast 503); final status after recovery=${st}, retry=${retry.status}`);
    assert.ok(retry.status === 202, `during outage analyse=${r.status} ${r.json?.error?.code || ''}; DB status after failure=${st}; retry after recovery=${retry.status} ${retry.json?.error?.code || ''} (scan is stuck: status was moved before the queue add and never rolled back)`);
    return `outage analyse=${r.status}; status=${st}; retry=${retry.status}`;
  });
  let scan;
  await check('F02-20', 'legacy core satellite path (Sentinel Hub credentials from .env): create scan on core API -> terminal state', async () => {
    const S = await farmer(c, 'F02L'); const fs2 = await makeField(S, { crop: 'wheat', lon: 72.4, lat: 31.6 });
    const r = await call('POST', `/fields/${fs2.fieldId}/satellite-scans`, { token: S.token, body: { maxCloudCoverage: 30 } });
    if (r.status !== 202) return `core create -> ${r.status} ${r.text.slice(0, 160)}`; scan = { u: S, id: r.json.id, provider: r.json.provider };
    let last; for (let i = 0; i < 40; i++) { last = (await call('GET', `/satellite-scans/${r.json.id}`, { token: S.token })).json; if (last && ['COMPLETED', 'NO_VALID_SCENE', 'CLOUD_BLOCKED', 'FAILED'].includes(last.processingStatus)) break; await sleep(5000); }
    assert.ok(last && ['COMPLETED', 'NO_VALID_SCENE', 'CLOUD_BLOCKED', 'FAILED'].includes(last.processingStatus), 'not terminal: ' + JSON.stringify(last).slice(0, 200));
    if (last.processingStatus === 'FAILED') throw blocked(`BLOCKED_EXTERNAL or defect: legacy Sentinel Hub path FAILED (${JSON.stringify(last.failureCode || last.metadata?.failureCode || '')}); worker log needed`);
    return `provider=${last.provider} final=${last.processingStatus} cloud=${last.cloudCoverage}`;
  });
  finish(path.join(out, 'f01-redis-f02-core.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
