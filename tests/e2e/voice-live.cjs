// Voice browser E2E: real Chromium with a FAKE MICROPHONE playing a recorded WAV -> consent -> upload to
// local-disk media -> real AssemblyAI transcription -> transcript fills the question box -> Ask.
// Needs an isolated stack (see F10_* variables) with SPEECH_STT_PROVIDER=assemblyai and a valid
// ASSEMBLYAI_API_KEY, and F10_VOICE_AUDIO pointing at a WAV. Speech in the clip is synthetic unless you
// supply a human recording. page.route() is used only to inject an outage.
const assert = require('node:assert/strict');
const required = ['F10_WEB_URL', 'F10_DATABASE_URL', 'F10_SEED_PATH', 'F10_API_MODULES_DIR', 'F10_VOICE_AUDIO'];
if (required.some((name) => !process.env[name])) {
  console.error(`BLOCKED_EXTERNAL: configure ${required.join(', ')}.`);
  process.exit(2);
}
const origin = new URL(process.env.F10_WEB_URL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local isolated stack only.');
if (!/\/f10_e2e$/.test(process.env.F10_DATABASE_URL)) throw new Error('Refusing to touch a non-F10 database.');
const { createRequire } = require('node:module');
const apiRequire = createRequire(`${process.env.F10_API_MODULES_DIR}/package.json`);
const { chromium } = require('playwright');
const { Client } = apiRequire('pg');
const seed = require(process.env.F10_SEED_PATH);
const expected = new RegExp(process.env.F10_VOICE_EXPECT || 'sow wheat', 'i');
const language = process.env.F10_VOICE_LANGUAGE || 'en';
const results = [];
const check = (name, fn) =>
  fn().then(
    (detail) => results.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }),
    (error) => results.push({ name, status: 'FAIL', detail: String(error.message).split('\n')[0] }),
  );
const url = (path) => new URL(path, origin).href;

(async () => {
  const db = new Client({ connectionString: process.env.F10_DATABASE_URL });
  await db.connect();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${process.env.F10_VOICE_AUDIO}`,
    ],
  });
  const open = async (who) => {
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.addCookies([{ name: 'fg_access', value: seed[who].token, url: origin.href, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(url('/assistant'));
    return { context, page };
  };
  const voice = (page) => page.getByRole('heading', { name: 'Ask FasalGuard by voice' }).locator('..');
  const until = async (page, test, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await test()) return; await page.waitForTimeout(150); }
    throw new Error('condition not met in time');
  };
  const consent = async (page) => {
    const box = voice(page).getByLabel(/I consent/);
    await until(page, () => box.isEnabled());
    await box.click();
    await until(page, () => box.isChecked());
  };
  const chat = (page) => page.locator('section[aria-labelledby="chat-heading"]');
  try {
    const a = await open('a');
    const page = a.page;
    await voice(page).getByText('Ask FasalGuard by voice').waitFor({ timeout: 20000 });

    await check('recording is disabled until the farmer consents', async () => {
      await voice(page).getByLabel('Language').selectOption(language);
      assert.equal(await voice(page).getByRole('button', { name: 'Start recording' }).isDisabled(), true);
    });

    await check('capabilities show speech-to-text but no server text-to-speech (Play transcript disabled)', async () => {
      assert.equal(await voice(page).getByRole('button', { name: 'Play transcript' }).isDisabled(), true);
    });

    let transcript = '';
    await check('REAL: microphone audio -> private upload -> AssemblyAI -> transcript in the editor and question box', async () => {
      await consent(page);
      await voice(page).getByRole('button', { name: 'Start recording' }).click();
      await voice(page).getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 10000 });
      await page.waitForTimeout(7000);
      await voice(page).getByRole('button', { name: 'Stop recording' }).click();
      const editor = voice(page).getByLabel('Editable transcript');
      await until(page, async () => (await editor.inputValue()).trim().length > 0, 60000);
      transcript = await editor.inputValue();
      assert.match(transcript, expected, `transcript was: ${transcript}`);
      assert.match(await chat(page).getByLabel('Your question').inputValue(), expected);
      return { transcript };
    });

    await check('the transcript only fills the box: nothing was sent to the assistant automatically', async () => {
      const rows = await db.query("SELECT count(*)::int AS n FROM assistant_messages m JOIN assistant_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1", [seed.a.user]);
      assert.equal(rows.rows[0].n, 0);
    });

    await check('database: consent recorded and the recording stored privately for the owner', async () => {
      const consent = await db.query("SELECT granted FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' ORDER BY created_at DESC LIMIT 1", [seed.a.user]);
      assert.equal(consent.rows[0]?.granted, true);
      const media = await db.query("SELECT purpose, status, content_type, size_bytes::int AS size FROM media_assets WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1", [seed.a.user]);
      assert.equal(media.rows[0].purpose, 'voice-note');
      assert.equal(media.rows[0].status, 'ready');
      assert.ok(media.rows[0].size > 1000);
      return { contentType: media.rows[0].content_type, bytes: media.rows[0].size };
    });

    await check('farmer sends the (reviewed) transcript with Ask and gets an answer card', async () => {
      await chat(page).getByLabel('Language').selectOption(language);
      await chat(page).getByRole('button', { name: 'Ask', exact: true }).click();
      await chat(page).locator('article').nth(1).waitFor({ timeout: 20000 });
      const row = (await db.query("SELECT language, grounding FROM assistant_messages m JOIN assistant_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='ASSISTANT'", [seed.a.user])).rows[0];
      assert.equal(row.language, language);
      return { grounding: row.grounding };
    });

    await check('Listen reads the answer aloud with an on-device voice, or says plainly that none is installed', async () => {
      const listen = chat(page).getByRole('button', { name: 'Listen' }).first();
      const voices = await page.evaluate(() => new Promise((resolve) => {
        const get = () => speechSynthesis.getVoices().map((v) => v.lang);
        const now = get();
        if (now.length) return resolve(now);
        speechSynthesis.onvoiceschanged = () => resolve(get());
        setTimeout(() => resolve(get()), 2000);
      }));
      await listen.click();
      const stopped = chat(page).getByRole('button', { name: 'Stop' }).first();
      const note = chat(page).locator('p[role="status"]');
      await Promise.race([stopped.waitFor({ timeout: 4000 }), note.waitFor({ timeout: 4000 })]);
      const speaking = await stopped.isVisible().catch(() => false);
      const message = speaking ? 'speaking' : await note.innerText();
      if (!speaking) assert.match(message, /voice is installed|cannot read answers aloud/);
      return { installedVoiceLocales: [...new Set(voices)], result: message };
    });

    await check('transcription outage (HTTP 503) shows a clear error, keeps the farmer able to type, and invents no transcript', async () => {
      const b = await open('b');
      await b.page.route('**/api/assistant/speech/transcribe', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Transcription is unavailable.' } }) }));
      await voice(b.page).getByLabel('Language').selectOption(language);
      await consent(b.page);
      await voice(b.page).getByRole('button', { name: 'Start recording' }).click();
      await voice(b.page).getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 10000 });
      await b.page.waitForTimeout(2500);
      await voice(b.page).getByRole('button', { name: 'Stop recording' }).click();
      await b.page.getByText('Transcription is unavailable.').waitFor({ timeout: 30000 });
      assert.equal(await voice(b.page).getByLabel('Editable transcript').inputValue(), '');
      assert.equal(await chat(b.page).getByLabel('Your question').inputValue(), '');
      await b.context.close();
    });

    await check('unauthenticated transcription request is rejected', async () => {
      const context = await browser.newContext();
      const response = await context.request.post(url('/api/assistant/speech/transcribe'), {
        data: { mediaAssetId: '3c63d709-a06d-4aa1-b660-c40d04b8dddb', language: 'en', consent: true, consentVersion: '2026-10-voice-v1' },
        headers: { origin: origin.origin },
      });
      assert.equal(response.status(), 401);
      await context.close();
    });
  } finally {
    await browser.close();
    await db.end();
  }
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(JSON.stringify({ status: failed.length ? 'RUN_FAIL' : 'RUN_PASS', passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => { console.error('RUN_FAIL', error.message); process.exitCode = 1; });
