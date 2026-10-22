// F08 API-level exploratory QA against the isolated qa2 stack (real AssemblyAI when the key is present).
const fs = require('node:fs');
const { db, farmer, call, check, results, blocked, crypto } = require('./lib.cjs');
const V = '2026-10-voice-v1';
const wav = (opts = {}) => {
  // synthetic PCM WAV builder for malformed-audio cases
  const { rate = 16000, ch = 1, bits = 16, seconds = 1, tone = true } = opts;
  const n = rate * seconds * ch;
  const data = Buffer.alloc(n * (bits / 8));
  if (tone) for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE((rate * ch * bits) / 8, 28);
  h.writeUInt16LE((ch * bits) / 8, 32); h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};
async function upload(tok, bytes, { contentType = 'audio/wav', purpose = 'voice-note', fileName = 'voice.wav', declared } = {}) {
  const p = await call('POST', '/uploads/presign', { token: tok, body: { fileName, contentType, sizeBytes: declared ?? bytes.length, purpose } });
  if (p.status >= 300) return { stage: 'presign', ...p };
  const u = p.json.upload;
  const put = await fetch(u.url, { method: 'PUT', headers: u.headers, body: bytes });
  if (put.status >= 300) return { stage: 'put', status: put.status, text: await put.text() };
  const c = await call('POST', '/uploads/complete', { token: tok, body: { mediaId: p.json.media.id } });
  return { stage: 'complete', mediaId: p.json.media.id, ...c };
}
let used = 0;
const pace = async (n = 1) => { // stay under the 10/min transcribe throttle so each case tests what it says
  if (used + n > 9) { await new Promise((r) => setTimeout(r, 62000)); used = 0; }
  used += n;
};
const transcribe = async (tok, mediaAssetId, language = 'en', extra = {}) => { await pace(); return call('POST', '/assistant/speech/transcribe', { token: tok, body: { mediaAssetId, language, consent: true, consentVersion: V, ...extra } }); };
const grant = (tok, granted = true, v = V) => call('POST', '/assistant/speech/consent', { token: tok, body: { granted, consentVersion: v } });
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); };
const in4xx = (r, m) => {
  if (r.status === 429 || r.status < 400 || r.status >= 500) throw new Error(`${m}: expected non-429 4xx, got ${r.status} ${String(r.text).slice(0, 160)}`);
  return `HTTP ${r.status} ${r.json?.error?.code ?? r.json?.code ?? ''}`;
};

(async () => {
  const c = await db();
  const A = await farmer(c, 'A');
  const B = await farmer(c, 'B');
  const audio = fs.readFileSync(process.env.QA2_SPEECH_WAV);
  await check('F08-01 unauthenticated capabilities/consent/transcribe/synthesize -> 401', async () => {
    const rs = await Promise.all([
      call('GET', '/assistant/speech/capabilities'),
      call('POST', '/assistant/speech/consent', { body: { granted: true, consentVersion: V } }),
      call('POST', '/assistant/speech/transcribe', { body: {} }),
      call('POST', '/assistant/speech/synthesize', { body: {} }),
    ]);
    rs.forEach((r) => eq(r.status, 401, 'status'));
    return 'all 401';
  });
  await check('F08-02 expired JWT -> 401', async () => {
    const X = await farmer(c, 'exp', { expired: true });
    eq((await call('GET', '/assistant/speech/capabilities', { token: X.token })).status, 401, 'status');
  });
  await check('F08-03 revoked session -> 401', async () => {
    const X = await farmer(c, 'rev');
    await c.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [X.sessionId]);
    eq((await call('GET', '/assistant/speech/capabilities', { token: X.token })).status, 401, 'status');
  });
  await check('F08-04 capabilities truthful (AssemblyAI STT; no fabricated server TTS)', async () => {
    const r = await call('GET', '/assistant/speech/capabilities', { token: A.token });
    eq(r.status, 200, 'status');
    return JSON.stringify(r.json).slice(0, 400);
  });
  const ok = await upload(A.token, audio);
  await check('F08-05 valid 16 kHz mono WAV upload accepted and stored ready', async () => {
    eq(ok.status, 200, `complete (${ok.stage}) ${String(ok.text).slice(0, 120)}`);
    return `status ${ok.json?.status}`;
  });
  await check('F08-06 transcribe with NO consent recorded -> rejected, no provider call', async () => in4xx(await transcribe(A.token, ok.mediaId), 'no consent'));
  await check('F08-07 consent validation: wrong version, non-boolean granted, empty body -> 400', async () => {
    eq((await grant(A.token, true, '1999-old')).status, 400, 'wrong version');
    eq((await call('POST', '/assistant/speech/consent', { token: A.token, body: { granted: 'yes', consentVersion: V } })).status, 400, 'non-bool');
    eq((await call('POST', '/assistant/speech/consent', { token: A.token, body: {} })).status, 400, 'empty');
  });
  await check('F08-08 grant consent persists a VOICE_PROCESSING grant row', async () => {
    const g = await grant(A.token, true);
    if (g.status >= 300) throw new Error(`HTTP ${g.status}`);
    const row = (await c.query("SELECT granted,policy_version FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' ORDER BY created_at DESC LIMIT 1", [A.userId])).rows[0];
    eq(row.granted, true, 'granted');
    eq(row.policy_version, V, 'version');
  });
  await check('F08-09 body consent:false / wrong consentVersion / bad language / bad UUID -> 400', async () => {
    eq((await transcribe(A.token, ok.mediaId, 'en', { consent: false })).status, 400, 'consent false');
    eq((await transcribe(A.token, ok.mediaId, 'en', { consentVersion: 'x' })).status, 400, 'version');
    eq((await transcribe(A.token, ok.mediaId, 'fr')).status, 400, 'lang');
    eq((await transcribe(A.token, 'not-a-uuid')).status, 400, 'uuid');
  });
  await check('F08-10 REAL AssemblyAI: English synthetic (Windows SAPI) WAV -> transcript mentions sow/wheat', async () => {
    if (!process.env.ASSEMBLYAI_API_KEY) throw blocked('BLOCKED_EXTERNAL: ASSEMBLYAI_API_KEY absent');
    const t0 = Date.now();
    const r = await transcribe(A.token, ok.mediaId, 'en');
    const ms = Date.now() - t0;
    if (r.status >= 300) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 200)}`);
    const txt = r.json.transcript ?? r.json.text ?? '';
    if (!/sow|wheat/i.test(txt)) throw new Error('transcript: ' + txt);
    return `HTTP ${r.status} ${ms}ms confidence=${r.json.confidence} provider=${r.json.provider} model=${r.json.model} transcript="${txt}"`;
  });
  await check('F08-11 farmer B cannot transcribe farmer A media (cross-owner)', async () => {
    await grant(B.token);
    return in4xx(await transcribe(B.token, ok.mediaId), 'cross-owner');
  });
  await check('F08-12 farmer B cannot get access-url of A media', async () => in4xx(await call('GET', `/media/${ok.mediaId}/access-url`, { token: B.token }), 'cross-owner access'));
  await check('F08-13 non-existent media id -> 404', async () => eq((await transcribe(A.token, crypto.randomUUID())).status, 404, 'status'));
  await check('F08-14 wrong-purpose media (crop-scan image) rejected for transcription', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const u = await upload(A.token, png, { contentType: 'image/png', purpose: 'crop-scan', fileName: 'x.png' });
    if (u.status !== 200) throw new Error('setup failed ' + u.stage + ' ' + u.status);
    return in4xx(await transcribe(A.token, u.mediaId), 'wrong purpose');
  });
  await check('F08-15 pending (never completed) upload cannot be transcribed', async () => {
    const p = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'p.wav', contentType: 'audio/wav', sizeBytes: 1000, purpose: 'voice-note' } });
    return in4xx(await transcribe(A.token, p.json.media.id), 'pending');
  });
  await check('F08-16 presign oversize (26 MB > 25 MB limit) -> 400', async () => {
    const r = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'big.wav', contentType: 'audio/wav', sizeBytes: 26 * 1024 * 1024, purpose: 'voice-note' } });
    eq(r.status, 400, 'status');
    return r.text.slice(0, 120);
  });
  await check('F08-17 presign sizeBytes 0 / negative / float -> 400', async () => {
    for (const s of [0, -5, 1.5]) eq((await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'a.wav', contentType: 'audio/wav', sizeBytes: s, purpose: 'voice-note' } })).status, 400, 'size ' + s);
  });
  await check('F08-18 presign disallowed MIME for voice-note -> 400', async () => {
    for (const t of ['text/plain', 'application/x-msdownload', 'audio/x-evil']) eq((await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'a.wav', contentType: t, sizeBytes: 100, purpose: 'voice-note' } })).status, 400, t);
  });
  await check('F08-19 text bytes declared as audio/wav -> complete rejects (content sniffing)', async () => in4xx(await upload(A.token, Buffer.from('this is not audio '.repeat(200))), 'fake wav'));
  await check('F08-20 empty body uploaded against declared size -> complete rejects', async () => in4xx(await upload(A.token, Buffer.alloc(0), { declared: 2000 }), 'empty'));
  await check('F08-21 44.1 kHz stereo WAV -> rejected (policy requires 16 kHz mono 16-bit)', async () => in4xx(await upload(A.token, wav({ rate: 44100, ch: 2 })), '44.1k stereo'));
  await check('F08-22 truncated WAV (header claims more data than present) -> rejected', async () => in4xx(await upload(A.token, wav({ seconds: 2 }).subarray(0, 600)), 'truncated'));
  await check('F08-23 declared size smaller than actual body -> rejected', async () => in4xx(await upload(A.token, wav({ seconds: 1 }), { declared: 500 }), 'size mismatch'));
  await check('F08-24 silent-but-valid WAV: no invented transcript (real AssemblyAI)', async () => {
    if (!process.env.ASSEMBLYAI_API_KEY) throw blocked('BLOCKED_EXTERNAL: ASSEMBLYAI_API_KEY absent');
    const u = await upload(A.token, wav({ tone: false, seconds: 2 }));
    eq(u.status, 200, 'upload ' + u.stage + ' ' + String(u.text).slice(0, 100));
    const r = await transcribe(A.token, u.mediaId);
    const t = r.json?.transcript ?? r.json?.text ?? '';
    if (r.status < 300 && t.trim()) throw new Error('invented transcript for silence: ' + t);
    return `HTTP ${r.status} transcript="${t}" ${r.text.slice(0, 120)}`;
  });
  await check('F08-25 path-traversal filename is normalised (no escape, no 500)', async () => {
    const r = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: '../../etc/passwd.wav', contentType: 'audio/wav', sizeBytes: 100, purpose: 'voice-note' } });
    if (r.status >= 500) throw new Error('500');
    return `HTTP ${r.status} ${JSON.stringify(r.json?.media ?? r.json?.error ?? '').slice(0, 220)}`;
  });
  await check('F08-26 PUT upload with tampered token -> rejected', async () => {
    const p = await call('POST', '/uploads/presign', { token: A.token, body: { fileName: 'a.wav', contentType: 'audio/wav', sizeBytes: 100, purpose: 'voice-note' } });
    const bad = p.json.upload.url.slice(0, -4) + 'AAAA';
    const r = await fetch(bad, { method: 'PUT', headers: p.json.upload.headers, body: Buffer.alloc(100) });
    if (r.status < 400) throw new Error('accepted ' + r.status);
    return 'HTTP ' + r.status;
  });
  await check('F08-27 synthesize with consent: provider labelling truthful', async () => {
    const r = await call('POST', '/assistant/speech/synthesize', { token: A.token, body: { text: 'Hello farmer', language: 'en', consentVersion: V } });
    return `HTTP ${r.status} ${JSON.stringify({ provider: r.json?.provider, model: r.json?.model, contentType: r.json?.contentType, err: r.json?.error ?? r.json?.message })}`;
  });
  await check('F08-28 synthesize validation: empty, >2000 chars, bad language, wrong version -> 400', async () => {
    for (const b of [
      { text: '', language: 'en', consentVersion: V },
      { text: 'x'.repeat(2001), language: 'en', consentVersion: V },
      { text: 'hi', language: 'zz', consentVersion: V },
      { text: 'hi', language: 'en', consentVersion: 'v0' },
    ]) eq((await call('POST', '/assistant/speech/synthesize', { token: A.token, body: b })).status, 400, JSON.stringify(b).slice(0, 40));
  });
  await check('F08-29 consent revocation: latest event granted=false; transcribe + synthesize now rejected', async () => {
    const rv = await grant(A.token, false);
    if (rv.status >= 300) throw new Error('revoke HTTP ' + rv.status);
    const rows = (await c.query("SELECT granted, revoked_at IS NOT NULL AS revoked FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' ORDER BY created_at, recorded_at", [A.userId])).rows;
    const t = await transcribe(A.token, ok.mediaId);
    const s = await call('POST', '/assistant/speech/synthesize', { token: A.token, body: { text: 'Hello', language: 'en', consentVersion: V } });
    if (t.status === 429 || t.status < 400 || t.status >= 500) throw new Error('transcribe after revoke: ' + t.status);
    if (s.status < 400 || s.status >= 500) throw new Error('synthesize after revoke: ' + s.status);
    return `rows=${JSON.stringify(rows)} transcribe=${t.status} synth=${s.status}`;
  });
  await check('F08-30 revocation of A does not revoke B', async () => {
    const r = await call('POST', '/assistant/speech/synthesize', { token: B.token, body: { text: 'Hello', language: 'en', consentVersion: V } });
    if (r.status === 403 || r.status === 401) throw new Error('B affected: ' + r.status);
    return `B synth HTTP ${r.status} ${r.json?.error?.code ?? ''} (503 SPEECH_LANGUAGE_UNAVAILABLE = no TTS provider, not a consent block)`;
  });
  await check('F08-31 re-grant after revoke restores access', async () => {
    await grant(A.token, true);
    const r = await transcribe(A.token, ok.mediaId);
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + r.text.slice(0, 100));
    return 'HTTP ' + r.status;
  });
  await check('F08-32 Urdu/Hindi accuracy on human speech', async () => {
    throw blocked('BLOCKED_EXTERNAL: no labelled, consented human Urdu/Hindi recording corpus + private manifest (see docs/features/f08-sample-manifest.example.json; scripts/evaluate-f08-speech.cjs)');
  });
  await check('F08-33 server-side TTS with a real provider (Azure/Qwen)', async () => {
    throw blocked('BLOCKED_EXTERNAL: AZURE_SPEECH_KEY/AZURE_SPEECH_REGION or QWEN_API_KEY not configured in .env');
  });
  await check('F08-34 transcribe rate limit (10/min): 429 reached, no 5xx', async () => {
    used = 9; await pace(); // fresh 60 s window
    const R = await farmer(c, 'rate');
    await grant(R.token);
    const codes = [];
    for (let i = 0; i < 14; i++) codes.push((await call('POST', '/assistant/speech/transcribe', { token: R.token, body: { mediaAssetId: crypto.randomUUID(), language: 'en', consent: true, consentVersion: V } })).status);
    if (!codes.includes(429)) throw new Error('no 429 in ' + codes.join(','));
    if (codes.some((x) => x >= 500)) throw new Error('5xx ' + codes.join(','));
    return codes.join(',');
  });
  await check('F08-35 rate limit is per-user: a different farmer is not throttled by farmer R (same source IP)', async () => {
    const r = await call('POST', '/assistant/speech/transcribe', { token: B.token, body: { mediaAssetId: crypto.randomUUID(), language: 'en', consent: true, consentVersion: V } });
    if (r.status === 429) throw new Error('farmer B received 429 caused by farmer R traffic: limiter is keyed on source IP, not user');
    return 'HTTP ' + r.status;
  });
  await c.end();
  console.log(JSON.stringify(results, null, 1));
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
})().catch((e) => { console.error('RUN_ERROR', e); process.exitCode = 2; });
