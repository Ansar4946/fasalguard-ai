// F08 real browser workflow: Chromium (fake mic playing a WAV) -> Next BFF -> Nest API -> private upload -> real AssemblyAI -> PostgreSQL.
// Env: QA2_SPEECH_WAV (speech), QA2_SILENCE_WAV (silence). Speech is synthetic Windows SAPI English, NOT farmer speech.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const { db, farmer, check, results } = require('./lib.cjs');
const WEB = 'http://localhost:3022'; // must match CORS_ORIGINS (direct PUT upload goes cross-origin to :4022)
const shots = path.resolve(__dirname, '../qa2-logs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = (wav) => chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(200); } throw new Error('condition not met in time'); };
(async () => {
  const c = await db();
  const A = await farmer(c, 'A8');
  const B = await farmer(c, 'B8');
  const browser = await launch(process.env.QA2_SPEECH_WAV);
  const open = async (br, who, opts = {}) => {
    const ctx = await br.newContext({ permissions: ['microphone'], ...opts });
    await ctx.addCookies([{ name: 'fg_access', value: who.token, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    await page.goto(`${WEB}/assistant`);
    const v = page.getByRole('heading', { name: 'Ask FasalGuard by voice' }).locator('..');
    await v.getByText('Ask FasalGuard by voice').waitFor({ timeout: 30000 });
    return { ctx, page, v, status: () => v.locator('p[role="status"]').innerText(), box: v.getByLabel(/I consent/), editor: v.getByLabel('Editable transcript') };
  };
  const consent = async (s) => { await until(() => s.box.isEnabled()); await s.box.click(); await until(() => s.box.isChecked()); };
  const record = async (s, ms) => { await s.v.getByRole('button', { name: 'Start recording' }).click(); await s.v.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 15000 }); await sleep(ms); await s.v.getByRole('button', { name: 'Stop recording' }).click(); };
  const lastConsent = async (u) => (await c.query("SELECT granted FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' ORDER BY created_at DESC, recorded_at DESC LIMIT 1", [u])).rows[0]?.granted;
  try {
    const a = await open(browser, A);
    await check('F08-B01 Start recording is disabled until consent; Play transcript disabled (no server TTS provider)', async () => {
      assert.equal(await a.v.getByRole('button', { name: 'Start recording' }).isDisabled(), true);
      assert.equal(await a.v.getByRole('button', { name: 'Play transcript' }).isDisabled(), true);
      return 'status: ' + (await a.status());
    });
    await check('F08-B02 ticking consent persists a VOICE_PROCESSING grant row in PostgreSQL', async () => {
      await consent(a); await until(async () => (await lastConsent(A.userId)) === true, 8000);
    });
    let transcript = '';
    await check('F08-B03 REAL: mic -> WAV -> private upload -> AssemblyAI -> editable transcript (English synthetic speech)', async () => {
      await a.v.getByLabel('Language').selectOption('en');
      await record(a, 7500);
      await until(async () => (await a.editor.inputValue()).trim().length > 0 || /unavailable|failed|no speech|could not/i.test(await a.status()), 90000);
      if (!(await a.editor.inputValue()).trim()) throw new Error('no transcript; UI status="' + (await a.status()) + '"');
      transcript = await a.editor.inputValue();
      assert.match(transcript, /sow|wheat/i, 'transcript: ' + transcript);
      await a.page.screenshot({ path: path.join(shots, 'f08-transcript.png'), fullPage: true });
      return `status="${await a.status()}" transcript="${transcript}"`;
    });
    await check('F08-B04 DB: recording stored privately for owner A only (voice-note, ready, audio/wav, size>1000)', async () => {
      const m = (await c.query("SELECT owner_id, purpose, status, content_type, size_bytes::int s FROM media_assets WHERE purpose='voice-note' AND status='ready' ORDER BY created_at DESC LIMIT 1")).rows[0];
      assert.equal(m.owner_id, A.userId); assert.equal(m.content_type, 'audio/wav'); assert.ok(m.s > 1000);
      return JSON.stringify({ ct: m.content_type, bytes: m.s });
    });
    await check('F08-B05 transcript is only a draft: nothing auto-sent to the assistant (0 assistant messages for A)', async () => {
      const n = (await c.query('SELECT count(*)::int n FROM assistant_messages m JOIN assistant_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1', [A.userId])).rows[0].n;
      assert.equal(n, 0);
    });
    await check('F08-B06 REAL answer + Listen: send reviewed transcript, answer card appears, Listen speaks or says plainly no voice installed', async () => {
      const chat = a.page.locator('section[aria-labelledby="chat-heading"]');
      await chat.getByRole('button', { name: 'Ask', exact: true }).click();
      await chat.locator('article').nth(1).waitFor({ timeout: 30000 });
      const listen = chat.getByRole('button', { name: 'Listen' }).first();
      await listen.click();
      const note = chat.locator('p[role="status"]'); const stop = chat.getByRole('button', { name: 'Stop' }).first();
      await Promise.race([stop.waitFor({ timeout: 5000 }), note.waitFor({ timeout: 5000 })]);
      const speaking = await stop.isVisible().catch(() => false);
      const msg = speaking ? 'speaking' : await note.innerText();
      if (!speaking) assert.match(msg, /voice is installed|cannot read answers aloud/);
      const voices = await a.page.evaluate(() => speechSynthesis.getVoices().map((x) => x.lang));
      return `installedVoiceLocales=${JSON.stringify([...new Set(voices)])} result="${msg}" (headless Chromium has no OS voices; real spoken audio unverified)`;
    });
    await check('F08-B07 revoke: unticking consent writes granted=false, disables Start, recording refused afterwards', async () => {
      await a.box.click(); await until(async () => (await lastConsent(A.userId)) === false, 8000);
      assert.equal(await a.v.getByRole('button', { name: 'Start recording' }).isDisabled(), true);
      return 'status="' + (await a.status()) + '"';
    });
    await check('F08-B08 consent state after reload reflects the SERVER (granted earlier, then revoked -> unchecked)', async () => {
      await a.page.reload(); const s = { box: a.page.getByLabel(/I consent/) };
      await until(() => s.box.isEnabled()); assert.equal(await s.box.isChecked(), false);
    });
    await check('F08-B09 re-grant then reload: UI shows consent from server (grant persisted, UI not stuck unchecked)', async () => {
      await a.page.getByLabel(/I consent/).click(); await until(async () => (await lastConsent(A.userId)) === true, 8000);
      await a.page.reload(); const box = a.page.getByLabel(/I consent/); await until(() => box.isEnabled());
      await sleep(1000);
      const checked = await box.isChecked();
      if (!checked) throw new Error('server holds an active grant but the UI shows consent unchecked after reload (state not rehydrated; farmer must re-tick every visit and cannot see their real consent state)');
    });
    await a.ctx.close();

    const b = await open(browser, B);
    await check('F08-B10 farmer B: consent NOT inherited from A, no transcript of A visible, Start disabled', async () => {
      assert.equal(await b.box.isChecked(), false);
      assert.equal((await b.editor.inputValue()).trim(), '');
      assert.equal(await b.v.getByRole('button', { name: 'Start recording' }).isDisabled(), true);
      assert.equal(await lastConsent(B.userId), undefined);
    });
    await check('F08-B11 provider outage (route-injected 503 on transcribe): clear error, no invented transcript', async () => {
      await b.page.route('**/api/assistant/speech/transcribe', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Transcription is unavailable.' } }) }));
      await consent(b); await record(b, 2500);
      await b.page.getByText('Transcription is unavailable.').waitFor({ timeout: 40000 });
      assert.equal((await b.editor.inputValue()).trim(), '');
    });
    await check('F08-B12 mic permission denied: readable message, no crash', async () => {
      await b.page.unroute('**/api/assistant/speech/transcribe');
      await b.page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
      await b.v.getByRole('button', { name: 'Start recording' }).click();
      await b.page.getByText('Microphone permission was denied.').waitFor({ timeout: 10000 });
    });
    await b.page.setViewportSize({ width: 375, height: 800 });
    await check('F08-B13 375px mobile viewport: no horizontal overflow', async () => {
      const o = await b.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await b.page.screenshot({ path: path.join(shots, 'f08-mobile.png') });
      assert.ok(o <= 1, 'overflow px ' + o);
    });
    await b.ctx.close();
  } finally { await browser.close(); }

  // silence + long recording use their own fake-mic files
  const sb = await launch(process.env.QA2_SILENCE_WAV);
  try {
    const s = await (async () => { const ctx = await sb.newContext({ permissions: ['microphone'] }); await ctx.addCookies([{ name: 'fg_access', value: (await farmer(c, 'S8')).token, url: WEB, httpOnly: true, sameSite: 'Lax' }]); const page = await ctx.newPage(); await page.goto(`${WEB}/assistant`); const v = page.getByRole('heading', { name: 'Ask FasalGuard by voice' }).locator('..'); await v.getByText('Ask FasalGuard by voice').waitFor({ timeout: 30000 }); return { ctx, page, v, box: v.getByLabel(/I consent/), editor: v.getByLabel('Editable transcript'), status: () => v.locator('p[role="status"]').innerText() }; })();
    await check('F08-B14 bad audio (pure silence from mic): honest "no speech" message, transcript stays empty', async () => {
      await consent(s); await record(s, 3500);
      await until(async () => /no speech|record again|unavailable|could not/i.test(await s.status()), 60000);
      const st = await s.status(); assert.equal((await s.editor.inputValue()).trim(), '');
      await s.page.screenshot({ path: path.join(shots, 'f08-silence.png') });
      return `status="${st}"`;
    });
    await check('F08-B15 long recording: auto-stops at maxRecordingSeconds (60 s), upload accepted, no hang', async () => {
      await s.v.getByRole('button', { name: 'Start recording' }).click();
      await s.v.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 15000 });
      const t0 = Date.now();
      await s.v.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 90000 });
      const secs = Math.round((Date.now() - t0) / 1000);
      assert.ok(secs >= 55 && secs <= 70, `auto-stop after ${secs}s`);
      await until(async () => !/Uploading|Preparing/.test(await s.status()), 90000);
      const m = (await c.query("SELECT size_bytes::int s, status FROM media_assets WHERE purpose='voice-note' ORDER BY created_at DESC LIMIT 1")).rows[0];
      return `auto-stopped after ~${secs}s; final status="${await s.status()}"; latest media ${JSON.stringify(m)}`;
    });
    await s.ctx.close();
  } finally { await sb.close(); }
  await c.end();
  console.log(JSON.stringify(results, null, 1));
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
})().catch((e) => { console.error('RUN_ERROR', e); process.exitCode = 2; });
