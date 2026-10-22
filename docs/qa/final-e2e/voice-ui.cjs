// FINAL E2E: voice recording UI. Env: QA_PASSWORD, QA_SCRATCH, QA_WAV (16 kHz mono wav). One login.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, mobile, desktop, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, d = '') => { results.push({ id, status, detail: String(d).slice(0, 900) }); console.log(status, id, '::', String(d).slice(0, 400)); fs.writeFileSync(path.join(OUT, 'voice-ui-results.json'), JSON.stringify(results, null, 1)); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
const chat = 'section[aria-labelledby=chat-heading]';

async function setup(browser, prof, perms, lang) {
  const ctx = await browser.newContext({ ...prof, storageState: STATE, permissions: perms });
  const page = await ctx.newPage();
  await page.goto(B + '/assistant', { waitUntil: 'load' });
  await page.locator('#voice-heading').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  if (lang === 'en') await page.getByRole('button', { name: 'English' }).first().click();
  const voice = page.locator('section[aria-labelledby=voice-heading]');
  const box = voice.locator('input[type=checkbox]');
  if (!(await box.isChecked())) { await box.click(); await page.waitForTimeout(1500); }
  return { ctx, page, voice };
}
async function recordOnce(page, voice, tag, lang, seconds) {
  const status = voice.locator('[role=status]').first();
  const start = voice.getByRole('button', { name: lang === 'en' ? 'Start recording' : 'ریکارڈنگ شروع کریں' });
  const stop = voice.getByRole('button', { name: lang === 'en' ? 'Stop recording' : 'ریکارڈنگ روکیں' });
  const idle = await status.innerText();
  await shot(page, `${tag}-voice-1-idle-${lang}`);
  await start.click();
  await stop.waitFor({ timeout: 10000 });
  await page.waitForTimeout(seconds * 1000);
  const wave = await voice.locator('[role=img]').count();
  const timer = await voice.locator('p.font-mono').innerText().catch(() => '');
  const recStatus = await status.innerText();
  await shot(page, `${tag}-voice-2-recording-${lang}`);
  rec(`t/${tag}/${lang}/idle-to-recording`, wave >= 1 && /\d:\d\d|\d+/.test(timer) ? 'PASS' : 'FAIL', `idle="${idle}" recording="${recStatus}" waveform=${wave} timer="${timer}"`);
  await stop.click();
  const seen = []; const t0 = Date.now(); let final = '';
  while (Date.now() - t0 < 60000) {
    const s = await status.innerText().catch(() => '');
    if (seen[seen.length - 1] !== s) { seen.push(s); if (/Upload|اپ لوڈ/.test(s)) await shot(page, `${tag}-voice-3-uploading-${lang}`); if (/Listening to your|سن رہا ہوں…$/.test(s) && !/Listening…/.test(s)) await shot(page, `${tag}-voice-4-transcribing-${lang}`); }
    const review = await page.locator('#voice-transcript').count();
    const alert = await voice.locator('[role=alert]').count();
    if (review || alert) { final = review ? 'review' : 'error'; break; }
    await page.waitForTimeout(80);
  }
  return { seen, final };
}

(async () => {
  await login();
  const wav = process.env.QA_WAV;
  // 1) real speech file on mobile, English
  let b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
  {
    const { ctx, page, voice } = await setup(b, mobile, ['microphone'], 'en');
    const r = await recordOnce(page, voice, 'm360-realwav', 'en', 4);
    rec('t/m360-realwav/en/states', 'INFO', r.seen.join(' > ') + ' => ' + r.final);
    if (r.final === 'review') {
      const val = await page.locator('#voice-transcript').inputValue();
      const auto = await voice.getByText(/Sending automatically/).count();
      await shot(page, 'm360-realwav-voice-5-review-en');
      rec('t/m360-realwav/en/transcript-bubble', /wheat|yellow|leaves/i.test(val) ? 'PASS' : 'FAIL', `transcript="${val}" autoSendBanner=${auto}`);
      const n0 = await page.locator(`${chat} article`).count();
      await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby=chat-heading] article').length >= n + 2, n0, { timeout: 60000 }).then(async () => {
        await page.waitForTimeout(800);
        const a = await page.locator(`${chat} article`).last().innerText();
        await shot(page, 'm360-realwav-voice-6-answer-en');
        rec('t/m360-realwav/en/autosend-cited-answer', /DEMO/.test(a) && /Sources/.test(a) ? 'PASS' : 'FAIL', a.replace(/\n+/g, ' | ').slice(0, 400));
      }, () => rec('t/m360-realwav/en/autosend-cited-answer', 'FAIL', 'no answer within 60s after transcript'));
    } else {
      const txt = final(r);
      function final(x) { return x.final; }
      const al = await voice.locator('[role=alert]').innerText().catch(() => '');
      await shot(page, 'm360-realwav-voice-5-error-en');
      rec('t/m360-realwav/en/transcript-bubble', 'FAIL', `final=${txt} alert="${al}"`);
    }
    // (v)/(j) Urdu RTL state check of the recording UI idle
    await ctx.close();
  }
  await b.close();

  // 2) fake beep device on desktop, Urdu then English: expects friendly no-speech/transcript state
  b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  {
    const { ctx, page, voice } = await setup(b, desktop, ['microphone'], 'ur');
    const r = await recordOnce(page, voice, 'd1440-beep', 'ur', 3);
    const al = await voice.locator('[role=alert]').innerText().catch(() => '');
    const val = await page.locator('#voice-transcript').inputValue().catch(() => null);
    await shot(page, 'd1440-beep-voice-5-final-ur');
    rec('t/d1440-beep/ur/final-state', r.final ? 'PASS' : 'FAIL', `states=${r.seen.join(' > ')} final=${r.final} alert="${al}" transcript=${JSON.stringify(val)}`);
    if (r.final === 'review') await page.locator('#voice-transcript').fill('test');
    await ctx.close();
  }
  await b.close();

  // 3) microphone denied (no fake-ui flag, no permission granted), mobile Urdu and English
  b = await chromium.launch({ args: ['--use-fake-device-for-media-stream'] });
  for (const lang of ['en', 'ur']) {
    const { ctx, page, voice } = await setup(b, mobile, [], lang);
    const start = voice.getByRole('button', { name: lang === 'en' ? 'Start recording' : 'ریکارڈنگ شروع کریں' });
    await start.click();
    await page.waitForTimeout(3000);
    const al = await voice.locator('[role=alert]').innerText().catch(() => '');
    await shot(page, `m360-denied-voice-${lang}`);
    const retry = voice.getByRole('button', { name: lang === 'en' ? 'Try again' : /دوبارہ/ });
    rec(`u/m360/${lang}/denied-message`, /denied|permission|اجازت/i.test(al) ? 'PASS' : 'FAIL', `alert="${al.replace(/\n+/g, ' | ')}" retryButtons=${await voice.locator('[role=alert] button').count()}`);
    rec(`u/m360/${lang}/retry-button`, (await voice.locator('[role=alert] button').count()) >= 1 ? 'PASS' : 'FAIL');
    await ctx.close();
  }
  await b.close();
  console.log('SUMMARY', JSON.stringify(results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {})));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
