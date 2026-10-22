// F01 image screening: real HTTP against core API (4027, BullMQ worker, Roboflow) and platform API (8027, Celery).
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { db, farmer, call, makeField, check, finish, sleep, crypto, API, PLAT, WEB, apiRequire } = require('./lib.cjs');
const sharp = apiRequire('sharp');
const repo = path.resolve(__dirname, '../../..');
const REAL = path.join(repo, 'public/expert-case-leaf-early.png');
const out = path.resolve(__dirname, '../qa7-logs');
const { blocked } = require('./lib.cjs');
const gate = (fin) => { if (/is not a function/.test(String(fin.failureCode))) throw blocked(`BLOCKED_BY_DEFECT F01-D1: worker failed with failureCode '${fin.failureCode}' (status ${fin.status}); behaviour under test could not be exercised`); };
async function upload(u, buf, { name = 'leaf.png', type = 'image/png', declared, purpose = 'crop-scan', checksum = true } = {}) {
  const sum = crypto.createHash('sha256').update(buf).digest('hex');
  const pre = await call('POST', '/uploads/presign', { token: u.token, body: { fileName: name, contentType: type, sizeBytes: declared ?? buf.length, ...(checksum ? { checksum: sum } : {}), purpose } });
  if (pre.status !== 201 && pre.status !== 200) return { pre };
  const put = await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: buf });
  const done = await call('POST', '/uploads/complete', { token: u.token, body: { mediaId: pre.json.media.id, ...(checksum ? { checksum: sum } : {}) } });
  return { pre, put: put.status, done, mediaId: pre.json.media.id };
}
async function scanFor(u, fieldId, buf, opts) {
  const s = await call('POST', '/crop-scans', { token: u.token, body: fieldId ? { fieldId } : {} });
  const up = await upload(u, buf, opts);
  if (!(up.put >= 200 && up.put < 300) && !opts?.tolerate) throw new Error('UPLOAD_PUT_FAILED put=' + up.put + ' presign=' + up.pre.status);
  const img = await call('POST', `/crop-scans/${s.json.id}/images`, { token: u.token, body: { mediaId: up.mediaId, category: 'LEAF_FRONT' } });
  return { scanId: s.json.id, up, img };
}
async function waitTerminal(u, id, base = API, ms = 90000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) {
    last = await call('GET', `/crop-scans/${id}`, { token: u.token, base });
    if (last.json && !['CREATED', 'UPLOADING', 'IMAGE_VALIDATION', 'ANALYSING', 'QUEUED'].includes(last.json.status)) return last.json;
    await sleep(1500);
  }
  return last.json;
}
(async () => {
  const c = await db();
  const A = await farmer(c, 'F01A'); const B = await farmer(c, 'F01B');
  const real = fs.readFileSync(REAL);
  const A2 = await farmer(c, 'F01A2'); const A3 = await farmer(c, 'F01A3'); const A4 = await farmer(c, 'F01A4');
  const fA = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.50 });
  const fAnone = await makeField(A, { crop: null, lon: 72.70, lat: 31.50 });
  const fA2 = await makeField(A2, { crop: 'wheat', lon: 72.50, lat: 32.50 });
  const fAmaize = await makeField(A3, { crop: 'maize', lon: 72.60, lat: 33.50 });
  const fA3none = await makeField(A3, { crop: null, lon: 72.70, lat: 33.50 });
  const fA3wheat = await makeField(A3, { crop: 'wheat', lon: 72.80, lat: 33.50 });
  const fA4 = await makeField(A4, { crop: 'wheat', lon: 71.50, lat: 31.50 });
  const fA4maize = await makeField(A4, { crop: 'maize', lon: 71.60, lat: 31.50 });
  const fB = await makeField(B, { crop: 'wheat', lon: 73.0, lat: 31.5 });

  await check('F01-01', 'unauthenticated create/get/analyse/list -> 401 (API)', async () => {
    const r = await Promise.all([call('POST', '/crop-scans', { body: {} }), call('GET', `/crop-scans/${crypto.randomUUID()}`), call('POST', `/crop-scans/${crypto.randomUUID()}/analyse`), call('GET', `/crop-scans?fieldId=${fA.fieldId}`)]);
    assert.deepEqual(r.map((x) => x.status), [401, 401, 401, 401]);
  });
  await check('F01-02', 'unauthenticated BFF /api/crop-scans* -> 401', async () => {
    const r = await Promise.all([call('POST', '/api/crop-scans', { base: WEB, body: {}, headers: { origin: WEB } }), call('GET', `/api/crop-scans/${crypto.randomUUID()}`, { base: WEB })]);
    assert.ok(r.every((x) => x.status === 401), r.map((x) => x.status).join(','));
  });
  await check('F01-03', 'expired token and revoked session -> 401', async () => {
    const e = await farmer(c, 'F01exp', { expired: true });
    assert.equal((await call('POST', '/crop-scans', { token: e.token, body: {} })).status, 401);
    const rv = await farmer(c, 'F01rev');
    await c.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [rv.sessionId]);
    const r = await call('POST', '/crop-scans', { token: rv.token, body: {} });
    assert.equal(r.status, 401, 'revoked session got ' + r.status);
  });
  await check('F01-04', 'wrong role (AGRICULTURE_EXPERT) -> 403', async () => {
    const x = await farmer(c, 'F01exp2', { role: 'AGRICULTURE_EXPERT' });
    const r = await call('POST', '/crop-scans', { token: x.token, body: {} });
    assert.equal(r.status, 403, 'got ' + r.status);
  });
  await check('F01-05', 'create: malformed fieldId / non-v4 / extra props', async () => {
    const bad = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: 'not-a-uuid' } });
    const v1 = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' } });
    const extra = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: fA.fieldId, status: 'DIAGNOSED', ownerId: B.userId } });
    assert.equal(bad.status, 400); assert.equal(v1.status, 400);
    assert.ok([400, 201].includes(extra.status));
    if (extra.status === 201) { const row = (await c.query('SELECT status,owner_id FROM crop_scans WHERE id=$1', [extra.json.id])).rows[0]; assert.equal(row.status, 'CREATED'); assert.equal(row.owner_id, A.userId); return 'extra props ignored (201), status stays CREATED, owner is caller'; }
    return 'extra props rejected 400';
  });
  await check('F01-06', 'create on foreign / nonexistent field -> 403 (no scan row)', async () => {
    const before = (await c.query('SELECT count(*)::int n FROM crop_scans WHERE owner_id=$1', [A.userId])).rows[0].n;
    const r1 = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: fB.fieldId } });
    const r2 = await call('POST', '/crop-scans', { token: A.token, body: { fieldId: crypto.randomUUID() } });
    const after = (await c.query('SELECT count(*)::int n FROM crop_scans WHERE owner_id=$1', [A.userId])).rows[0].n;
    assert.deepEqual([r1.status, r2.status], [403, 403]); assert.equal(before, after);
    return 'foreign=403, nonexistent=403 (F01.md AT04 plans 404 for foreign resources; actual is 403)';
  });
  await check('F01-07', 'presign validation: bad mime, svg/html/pdf, >15MB, zero/negative/float size, bad purpose, empty name, long name, bad checksum', async () => {
    const t = (b) => call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'a.png', contentType: 'image/png', sizeBytes: 1000, purpose: 'crop-scan', ...b } });
    const cases = { svg: t({ contentType: 'image/svg+xml' }), html: t({ contentType: 'text/html' }), pdf: t({ contentType: 'application/pdf' }), big: t({ sizeBytes: 15 * 1024 * 1024 + 1 }), zero: t({ sizeBytes: 0 }), neg: t({ sizeBytes: -5 }), flt: t({ sizeBytes: 10.5 }), purpose: t({ purpose: 'admin' }), noname: t({ fileName: '' }), longname: t({ fileName: 'a'.repeat(300) + '.png' }), badsum: t({ checksum: 'zz' }), symbols: t({ fileName: '../../etc/passwd' }) };
    const r = {}; for (const [k, v] of Object.entries(cases)) r[k] = (await v).status;
    for (const k of ['svg', 'html', 'pdf', 'big', 'zero', 'neg', 'flt', 'purpose', 'noname', 'longname', 'badsum']) assert.equal(r[k], 400, `${k}=${r[k]}`);
    return JSON.stringify(r) + ' (path-traversal name sanitised, not an error)';
  });
  let realScan;
  await check('F01-08', 'REAL: wheat field, real leaf image -> upload -> attach -> analyse 202 -> terminal state with real provider', async () => {
    const s = await scanFor(A, fA.fieldId, real);
    assert.equal(s.up.done.status, 200); assert.equal(s.img.status, 201, 'addImage ' + s.img.status + s.img.text.slice(0, 200));
    const an = await call('POST', `/crop-scans/${s.scanId}/analyse`, { token: A.token });
    assert.equal(an.status, 202); assert.equal(an.json.status, 'IMAGE_VALIDATION');
    realScan = s.scanId;
    const fin = await waitTerminal(A, s.scanId);
    if (/is not a function/.test(String(fin.failureCode))) assert.fail(`real-image scan ended status=${fin.status} failureCode='${fin.failureCode}' (internal TypeError in the compiled worker: sharp default import); no screening produced`);
    const preds = (await c.query("SELECT predicted_condition,confidence,raw_provider_response->>'cropName' crop FROM model_predictions WHERE scan_id=$1", [s.scanId])).rows;
    const mv = (await c.query('SELECT mv.model_id,mv.model_version FROM model_predictions mp JOIN model_versions mv ON mv.id=mp.model_version_id WHERE mp.scan_id=$1', [s.scanId])).rows;
    return `status=${fin.status} failure=${fin.failureCode} cond=${fin.screenedCondition} conf=${fin.confidence} disp=${fin.disposition} firm=${fin.isFirmDiagnosis} preds=${preds.length} model=${JSON.stringify(mv)} crop=${preds[0]?.crop}`;
  });
  await check('F01-09', 'result contract: not a firm diagnosis, disclaimer, alternatives, confidence in [0,1], DB matches API', async () => {
    const r = await call('GET', `/crop-scans/${realScan}`, { token: A.token });
    assert.equal(r.status, 200);
    gate(r.json);
    if (!r.json.screenedCondition) { assert.ok(['NEEDS_FOLLOW_UP', 'FAILED'].includes(r.json.status), 'no diagnosis but status ' + r.json.status); return `no diagnosis, status ${r.json.status}/${r.json.failureCode}`; }
    assert.equal(r.json.isFirmDiagnosis, false); assert.match(r.json.disclaimer, /not a confirmed/i);
    assert.ok(r.json.confidence >= 0 && r.json.confidence <= 1);
    const d = (await c.query('SELECT screened_condition,confidence FROM diagnoses WHERE scan_id=$1', [realScan])).rows[0];
    assert.equal(d.screened_condition, r.json.screenedCondition);
    return `alts=${r.json.alternatives.length}`;
  });
  await check('F01-11', 'farmer B cannot read/attach/analyse/list farmer A scan or media', async () => {
    const g = await call('GET', `/crop-scans/${realScan}`, { token: B.token });
    const an = await call('POST', `/crop-scans/${realScan}/analyse`, { token: B.token });
    const mid = (await c.query('SELECT media_asset_id m FROM scan_images WHERE scan_id=$1', [realScan])).rows[0].m;
    const bs = await call('POST', '/crop-scans', { token: B.token, body: {} });
    const steal = await call('POST', `/crop-scans/${bs.json.id}/images`, { token: B.token, body: { mediaId: mid, category: 'LEAF_FRONT' } });
    const acc = await call('GET', `/media/${mid}/access-url`, { token: B.token });
    const lst = await call('GET', `/crop-scans?fieldId=${fA.fieldId}`, { token: B.token });
    assert.deepEqual([g.status, an.status, steal.status, acc.status], [404, 404, 400, 404], JSON.stringify([g.status, an.status, steal.status, acc.status]));
    assert.deepEqual(lst.json, [], 'B list of A field must be empty, got ' + lst.text.slice(0, 100));
    return `get=404 analyse=404 attach-A-media=400 access-url=404 list-A-field-as-B=${lst.status} []`;
  });
  await check('F01-12', 'analyse validation: no image -> 400; bad uuid -> 400; unknown id -> 404', async () => {
    const s = await call('POST', '/crop-scans', { token: A.token, body: {} });
    const a = await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: A.token });
    const b = await call('POST', '/crop-scans/xyz/analyse', { token: A.token });
    const d = await call('GET', `/crop-scans/${crypto.randomUUID()}`, { token: A.token });
    assert.deepEqual([a.status, b.status, d.status], [400, 400, 404]);
  });
  await check('F01-13', 'empty history: new field with no scans -> [] ; list requires fieldId (400)', async () => {
    const r = await call('GET', `/crop-scans?fieldId=${fAnone.fieldId}`, { token: A.token });
    const m = await call('GET', '/crop-scans', { token: A.token });
    assert.equal(r.status, 200); assert.deepEqual(r.json, []); assert.equal(m.status, 400);
  });
  await check('F01-14', 'attach: bad category, non-uuid media, other-purpose media, pending media, many images', async () => {
    const s = await call('POST', '/crop-scans', { token: A.token, body: {} });
    const cat = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: crypto.randomUUID(), category: 'BOGUS' } });
    const nonuuid = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: 'x', category: 'LEAF_FRONT' } });
    const other = await upload(A, real, { purpose: 'field-inspection' });
    const wrongPurpose = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: other.mediaId, category: 'LEAF_FRONT' } });
    const pend = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'p.png', contentType: 'image/png', sizeBytes: 1000, purpose: 'crop-scan' } });
    const pending = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: pend.json.media.id, category: 'LEAF_FRONT' } });
    assert.equal(cat.status, 400); assert.equal(nonuuid.status, 400); assert.equal(wrongPurpose.status, 400); assert.equal(pending.status, 400);
    const codes = [];
    for (let i = 0; i < 7; i++) { const x = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A.token, body: { mediaId: (await upload(A, real)).mediaId, category: 'WHOLE_PLANT' } }); codes.push(x.status); }
    const n = (await c.query('SELECT count(*)::int n FROM scan_images WHERE scan_id=$1', [s.json.id])).rows[0].n;
    if (n > 5) assert.fail(`image-count cap missing: ${n} images attached to one scan (codes ${codes.join(',')}); F01.md says <=3, platform router says <=5`);
    return `attach codes ${codes.join(',')}; rows=${n}`;
  });
  await check('F01-15', 'upload completion: never-uploaded media, HTML bytes labelled png, PNG bytes labelled jpeg', async () => {
    const pre = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'x.png', contentType: 'image/png', sizeBytes: real.length, purpose: 'crop-scan' } });
    const noPut = await call('POST', '/uploads/complete', { token: A.token, body: { mediaId: pre.json.media.id } });
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const h = await upload(A, html, { name: 'a.png', type: 'image/png' });
    const spoof = await upload(A, real, { name: 'a.jpg', type: 'image/jpeg' });
    return `neverUploaded->complete=${noPut.status}; html-as-png: put=${h.put} complete=${h.done?.status} ${(h.done?.text || '').slice(0, 80)}; png-as-jpeg: put=${spoof.put} complete=${spoof.done?.status}`;
  });
  await check('F01-16', 'declared size vs actual bytes mismatch (declare 1000, send ~2.7MB)', async () => {
    const r = await upload(A, real, { declared: 1000 });
    return `presign=${r.pre.status} put=${r.put} complete=${r.done?.status} ${(r.done?.text || '').slice(0, 100)}`;
  });
  await check('F01-17', 'PUT upload URL after complete: replay must not overwrite a verified object (TOCTOU)', async () => {
    const pre = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'x.png', contentType: 'image/png', sizeBytes: real.length, purpose: 'crop-scan' } });
    const p1 = await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: real });
    const done = await call('POST', '/uploads/complete', { token: A.token, body: { mediaId: pre.json.media.id } });
    const key = (await c.query('SELECT object_key k,status FROM media_assets WHERE id=$1', [pre.json.media.id])).rows[0];
    const sha = () => require('node:child_process').execSync(`docker exec qa7-api sh -c "sha256sum /data/media/${key.k}"`).toString().split(' ')[0];
    const before = sha();
    const p2 = await fetch(pre.json.upload.url, { method: 'PUT', headers: pre.json.upload.headers, body: Buffer.from('REPLACED-AFTER-COMPLETE') });
    const after = sha();
    const comp = await call('POST', '/uploads/complete', { token: B.token, body: { mediaId: pre.json.media.id } });
    assert.ok([404, 403, 400].includes(comp.status), 'B completing A media: ' + comp.status);
    assert.equal(done.status, 200);
    assert.equal(before, after, `verified object was overwritten after completion (PUT replay=${p2.status}); media status still '${key.status}'`);
    return `put1=${p1.status} replay=${p2.status} B-complete=${comp.status}`;
  });
  const badImg = async (id, name, buf, opts) => check(id, name, async () => {
    const s = await scanFor(A2, fA2.fieldId, buf, { ...opts, tolerate: true });
    if (s.img.status !== 201) return `rejected before analysis: presign=${s.up.pre.status} complete=${s.up.done?.status} attach=${s.img.status} ${(s.img.text || '').slice(0, 100)}`;
    await call('POST', `/crop-scans/${s.scanId}/analyse`, { token: A2.token });
    const fin = await waitTerminal(A2, s.scanId, API, 60000);
    const n = (await c.query('SELECT (SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d,(SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p', [s.scanId])).rows[0];
    gate(fin);
    assert.equal(n.d + n.p, 0, 'prediction/diagnosis created for bad image: ' + fin.status);
    assert.ok(['NEEDS_FOLLOW_UP', 'FAILED'].includes(fin.status), 'status ' + fin.status);
    return `status=${fin.status} failure=${fin.failureCode} diagnoses=${n.d} predictions=${n.p}`;
  });
  await badImg('F01-18', 'corrupt image (valid PNG header + garbage) -> typed failure, no prediction', Buffer.concat([real.subarray(0, 64), crypto.randomBytes(4000)]));
  await badImg('F01-19', 'tiny image 100x100 -> IMAGE_DIMENSIONS_TOO_SMALL, no prediction', await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 60, g: 140, b: 60 } } }).png().toBuffer());
  await badImg('F01-20', 'solid black 800x800 (TOO_DARK) -> follow-up, no prediction', await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer());
  await badImg('F01-21', 'HTML bytes uploaded as image/png -> must not reach provider', Buffer.from('<html><body>' + 'x'.repeat(3000) + '</body></html>'));
  await badImg('F01-22', 'huge-pixel image 20000x20000 uniform PNG (small file, 400 MP)', await sharp({ create: { width: 20000, height: 20000, channels: 3, background: { r: 90, g: 120, b: 80 } }, limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer().catch(() => Buffer.from('generation-failed')));
  await check('F01-23', 'maize field screened with the real provider: unsupported crop must not receive another crop model labels', async () => {
    const s = await scanFor(A3, fAmaize.fieldId, real);
    await call('POST', `/crop-scans/${s.scanId}/analyse`, { token: A3.token });
    const fin = await waitTerminal(A3, s.scanId);
    gate(fin);
    const raw = (await c.query("SELECT mv.model_id,mp.raw_provider_response->>'cropName' crop FROM model_predictions mp JOIN model_versions mv ON mv.id=mp.model_version_id WHERE mp.scan_id=$1", [s.scanId])).rows;
    if (raw.length) assert.fail(`maize leaf was screened by model ${raw[0].model_id} (cropName=${raw[0].crop}) -> status ${fin.status}, label ${fin.screenedCondition}`);
    return `status=${fin.status} failure=${fin.failureCode}`;
  });
  await check('F01-24', 'field without crop cycle: must not be screened with a generic crop model', async () => {
    const s = await scanFor(A3, fA3none.fieldId, real);
    await call('POST', `/crop-scans/${s.scanId}/analyse`, { token: A3.token });
    const fin = await waitTerminal(A3, s.scanId);
    gate(fin);
    const raw = (await c.query('SELECT mv.model_id FROM model_predictions mp JOIN model_versions mv ON mv.id=mp.model_version_id WHERE mp.scan_id=$1', [s.scanId])).rows;
    if (raw.length) assert.fail(`no-crop field got model ${raw[0].model_id}, label ${fin.screenedCondition}`);
    return `status=${fin.status} failure=${fin.failureCode}`;
  });
  await check('F01-25', 'concurrent analyse x6 on one scan -> exactly one accepted job and <=1 prediction', async () => {
    const s = await scanFor(A3, fA3wheat.fieldId, real);
    const rs = await Promise.all(Array.from({ length: 6 }, () => call('POST', `/crop-scans/${s.scanId}/analyse`, { token: A3.token })));
    const codes = rs.map((r) => r.status).sort();
    await waitTerminal(A3, s.scanId);
    const n = (await c.query('SELECT (SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p,(SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d', [s.scanId])).rows[0];
    assert.ok(n.p <= 1 && n.d <= 1, 'duplicates: ' + JSON.stringify(n));
    const accepted = codes.filter((x) => x === 202).length;
    assert.equal(accepted, 1, `codes=${codes} (expected exactly one 202)`);
    return `codes=${codes} rows=${JSON.stringify(n)}`;
  });
  await check('F01-26', 'analyse rate limit: >10 analyses/hour per farmer -> 429', async () => {
    const R = await farmer(c, 'F01rate'); const codes = [];
    for (let i = 0; i < 12; i++) { const s = await call('POST', '/crop-scans', { token: R.token, body: {} }); const up = await upload(R, real); await call('POST', `/crop-scans/${s.json.id}/images`, { token: R.token, body: { mediaId: up.mediaId, category: 'LEAF_FRONT' } }); codes.push((await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: R.token })).status); }
    assert.ok(codes.includes(429), codes.join(','));
    return codes.join(',');
  });
  await check('F01-30', 'platform capabilities (configured models, no secrets in response)', async () => {
    const r = await call('GET', '/crop-scans/capabilities', { token: A4.token, base: PLAT });
    assert.equal(r.status, 200); assert.ok(!/api_key|apikey|secret/i.test(r.text));
    return r.text.slice(0, 300);
  });
  let pscan;
  await check('F01-31', 'REAL platform path: create -> attach (shared media) -> analyse 202 -> Celery -> provider -> terminal', async () => {
    const up = await upload(A4, real);
    const s = await call('POST', '/crop-scans', { token: A4.token, base: PLAT, body: { fieldId: fA4.fieldId } });
    assert.equal(s.status, 201, s.text.slice(0, 200));
    pscan = s.json.id;
    const im = await call('POST', `/crop-scans/${s.json.id}/images`, { token: A4.token, base: PLAT, body: { mediaId: up.mediaId, category: 'LEAF_FRONT' } });
    assert.equal(im.status, 201, im.text.slice(0, 200));
    const an = await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: A4.token, base: PLAT });
    const fin = await waitTerminal(A4, s.json.id, PLAT);
    const info = `status=${fin.status} failure=${fin.failureCode} cond=${fin.screenedCondition} conf=${fin.confidence} disp=${fin.disposition}`;
    assert.equal(an.status, 202, `POST analyse returned ${an.status} ${an.text.slice(0, 80)} although the task was queued and finished: ${info}`);
    return info;
  });
  await check('F01-31b', 'platform result persisted: model provenance, DB rows, firm=false, disclaimer, alternatives', async () => {
    const r = await call('GET', `/crop-scans/${pscan}`, { token: A4.token, base: PLAT });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'DIAGNOSED');
    assert.equal(r.json.isFirmDiagnosis, false); assert.match(r.json.disclaimer, /not a confirmed/i);
    const d = (await c.query('SELECT (SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d,(SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p,(SELECT count(*) FROM ai_runs WHERE source_id=$1)::int a', [pscan])).rows[0];
    assert.deepEqual([d.d, d.p], [1, 1]);
    const mv = (await c.query('SELECT mv.model_id,mv.model_version,mp.confidence,mp.inference_timestamp FROM model_predictions mp JOIN model_versions mv ON mv.id=mp.model_version_id WHERE mp.scan_id=$1', [pscan])).rows[0];
    return `cond=${r.json.screenedCondition} conf=${r.json.confidence} alts=${r.json.alternatives.length} ai_runs=${d.a} model=${mv.model_id}@${mv.model_version}`;
  });
  await check('F01-10', 'idempotency: analyse again on a DIAGNOSED scan (platform) -> 400 SCAN_NOT_READY; still one diagnosis & prediction row', async () => {
    const r = await call('POST', `/crop-scans/${pscan}/analyse`, { token: A4.token, base: PLAT });
    const n = (await c.query('SELECT (SELECT count(*) FROM diagnoses WHERE scan_id=$1)::int d,(SELECT count(*) FROM model_predictions WHERE scan_id=$1)::int p', [pscan])).rows[0];
    assert.equal(r.status, 400, 'status ' + r.status + ' ' + r.text.slice(0, 100)); assert.equal(r.json.error?.code, 'SCAN_NOT_READY'); assert.deepEqual([n.d, n.p], [1, 1]);
  });
  await check('F01-32', 'platform: B cannot read A scan (404), foreign field create 403', async () => {
    const g = await call('GET', `/crop-scans/${pscan}`, { token: B.token, base: PLAT });
    const cr = await call('POST', '/crop-scans', { token: B.token, base: PLAT, body: { fieldId: fA4.fieldId } });
    const l = await call('GET', `/crop-scans?fieldId=${fA4.fieldId}`, { token: B.token, base: PLAT });
    assert.equal(g.status, 404); assert.equal(cr.status, 403);
    return `list-A-field-as-B=${l.status} ${l.text.slice(0, 60)}`;
  });
  await check('F01-33', 'platform: validation (extra fields, bad uuid, no token, wrong role) and repeat analyse', async () => {
    const x = await call('POST', '/crop-scans', { token: A4.token, base: PLAT, body: { fieldId: fA4.fieldId, extra: 1 } });
    const y = await call('GET', '/crop-scans/nope', { token: A4.token, base: PLAT });
    const z = await call('GET', `/crop-scans/${pscan}`, { base: PLAT });
    const ex = await farmer(c, 'F01pexp', { role: 'AGRICULTURE_EXPERT' });
    const w = await call('POST', '/crop-scans', { token: ex.token, base: PLAT, body: {} });
    const again = await call('POST', `/crop-scans/${pscan}/analyse`, { token: A4.token, base: PLAT });
    assert.deepEqual([x.status, y.status, z.status, w.status], [400, 400, 401, 403], JSON.stringify([x.status, y.status, z.status, w.status]));
    return `repeat-analyse=${again.status}`;
  });
  await check('F01-34', 'platform: maize field -> CROP_NOT_SUPPORTED, no fabricated prediction', async () => {
    const up = await upload(A4, real);
    const s = await call('POST', '/crop-scans', { token: A4.token, base: PLAT, body: { fieldId: fA4maize.fieldId } });
    await call('POST', `/crop-scans/${s.json.id}/images`, { token: A4.token, base: PLAT, body: { mediaId: up.mediaId, category: 'LEAF_FRONT' } });
    await call('POST', `/crop-scans/${s.json.id}/analyse`, { token: A4.token, base: PLAT });
    const fin = await waitTerminal(A4, s.json.id, PLAT);
    const n = (await c.query('SELECT count(*)::int n FROM model_predictions WHERE scan_id=$1', [s.json.id])).rows[0].n;
    assert.equal(n, 0); assert.ok(['FAILED', 'NEEDS_FOLLOW_UP', 'EXPERT_REVIEW'].includes(fin.status));
    return `status=${fin.status} failure=${fin.failureCode} predictions=${n}`;
  });
  finish(path.join(out, 'f01-api.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
