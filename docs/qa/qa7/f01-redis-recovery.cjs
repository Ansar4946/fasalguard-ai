// BullMQ worker recovery after a Redis restart (core crop-scan queue). Pass = a scan submitted after Redis is back is processed within 90 s.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, sh, API } = require('./lib.cjs');
const out = path.resolve(__dirname, '../qa7-logs');
const REAL = fs.readFileSync(path.resolve(__dirname, '../../../public/expert-case-leaf-early.png'));
async function mk(u, fieldId) {
  const s = await call('POST', '/crop-scans', { token: u.token, body: { fieldId } });
  const pre = await call('POST', '/uploads/presign', { token: u.token, body: { fileName: 'leaf.png', contentType: 'image/png', sizeBytes: REAL.length, purpose: 'crop-scan' } });
  await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: REAL }); await call('POST', '/uploads/complete', { token: u.token, body: { mediaId: pre.json.media.id } });
  await call('POST', `/crop-scans/${s.json.id}/images`, { token: u.token, body: { mediaId: pre.json.media.id, category: 'LEAF_FRONT' } }); return s.json.id;
}
const waitProcessed = async (u, id, ms) => { const end = Date.now() + ms; let st; while (Date.now() < end) { st = (await call('GET', `/crop-scans/${id}`, { token: u.token })).json?.status; if (st && !['CREATED', 'UPLOADING', 'IMAGE_VALIDATION'].includes(st)) return st; await sleep(3000); } return st; };
(async () => {
  const c = await db(); const A = await farmer(c, 'F01W'); const f = await makeField(A, { crop: 'wheat', lon: 72.5, lat: 33.0 });
  await check('F01-28', 'baseline: core worker processes a scan within 60 s', async () => { const id = await mk(A, f.fieldId); await call('POST', `/crop-scans/${id}/analyse`, { token: A.token }); const st = await waitProcessed(A, id, 60000); assert.ok(!['IMAGE_VALIDATION', 'CREATED', 'UPLOADING'].includes(st), 'status ' + st); return st; });
  await check('F01-29', 'after a Redis restart (stop 5 s, start), a scan submitted once Redis is healthy is processed by the already-running worker within 90 s', async () => {
    sh('docker stop qa7-redis'); await sleep(5000); sh('docker start qa7-redis'); await sleep(10000);
    const id = await mk(A, f.fieldId); const an = await call('POST', `/crop-scans/${id}/analyse`, { token: A.token, timeout: 40000 }); const st = await waitProcessed(A, id, 90000);
    assert.ok(!['IMAGE_VALIDATION', 'CREATED', 'UPLOADING'].includes(st), `scan still ${st} 90 s after Redis recovered (analyse http ${an.status}); the BullMQ worker did not resume (needs restart)`); return `analyse=${an.status} final=${st}`;
  });
  await check('F01-29b', 'after a 45 s Redis outage, a scan submitted once Redis is healthy is processed by the already-running worker within 120 s', async () => {
    sh('docker stop qa7-redis'); await sleep(45000); sh('docker start qa7-redis'); await sleep(10000);
    const id = await mk(A, f.fieldId); const an = await call('POST', `/crop-scans/${id}/analyse`, { token: A.token, timeout: 40000 }); const st = await waitProcessed(A, id, 120000);
    assert.ok(!['IMAGE_VALIDATION', 'CREATED', 'UPLOADING'].includes(st), `scan still ${st} 120 s after a 45 s Redis outage ended (analyse http ${an.status}); BullMQ worker did not resume`); return `analyse=${an.status} final=${st}`;
  });
  finish(path.join(out, 'f01-redis-recovery.json')); await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
