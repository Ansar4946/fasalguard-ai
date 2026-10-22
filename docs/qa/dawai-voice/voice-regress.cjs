// Voice recording UI state machine (fake mic) + regression of other routes + nav label.
const fs = require('node:fs'); const path = require('node:path');
const { chromium, B, OUT, STATE, results, rec, mobile, desktop } = require('./lib.cjs');
const S = process.env.QA_SCRATCH;
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    const ctx = await browser.newContext({ ...opts, storageState: STATE, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const reqs = []; page.on('request', (r) => { if (/speech|transcri|uploads|media/.test(r.url())) reqs.push(r.method() + ' ' + r.url().replace(B, '').slice(0, 70)); });
    page.on('response', (r) => { if (/speech|transcri/.test(r.url())) reqs.push('  -> ' + r.status() + ' ' + r.url().replace(B, '').slice(0, 70)); });
    await page.goto(B + '/assistant', { waitUntil: 'load' });
    await page.locator('#voice-heading').waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    const voice = page.locator('section[aria-labelledby=voice-heading]');
    const status = voice.locator('[role=status]').first();
    rec(`${tag}/voice/idle`, 'INFO', (await status.innerText()));
    await shot(page, `${tag}-30-voice-idle-ur`);
    await page.getByRole('button', { name: 'English' }).first().click();
    const box = voice.locator('input[type=checkbox]');
    if (!(await box.isChecked())) { await box.click(); await page.waitForTimeout(1200); }
    rec(`${tag}/voice/consent`, (await box.isChecked()) ? 'PASS' : 'FAIL');
    const start = voice.getByRole('button', { name: 'Start recording' });
    rec(`${tag}/voice/mic-enabled`, (await start.isEnabled()) ? 'PASS' : 'FAIL', await status.innerText());
    await start.click();
    const stop = voice.getByRole('button', { name: 'Stop recording' });
    await stop.waitFor({ timeout: 10000 }).then(() => rec(`${tag}/voice/recording-state`, 'PASS'), () => rec(`${tag}/voice/recording-state`, 'FAIL', 'no stop button'));
    await page.waitForTimeout(3000);
    const wave = await voice.locator('[role=img][aria-label*="level" i], [aria-label*="microphone level" i]').count();
    const timer = await voice.locator('p.font-mono').innerText().catch(() => '');
    rec(`${tag}/voice/waveform-timer`, wave && /\d:\d\d/.test(timer) ? 'PASS' : 'FAIL', `wave=${wave} timer="${timer}" status="${await status.innerText()}"`);
    await shot(page, `${tag}-31-voice-recording-en`);
    await stop.click();
    const seen = new Set(); const t0 = Date.now(); let finalState = '';
    while (Date.now() - t0 < 40000) {
      const s = await status.innerText().catch(() => ''); seen.add(s);
      const review = await page.locator('#voice-transcript').count();
      const alert = await voice.locator('[role=alert]').count();
      if (review || alert) { finalState = review ? 'review' : 'error'; break; }
      await page.waitForTimeout(250);
    }
    rec(`${tag}/voice/states-after-stop`, 'INFO', [...seen].join(' > ') + ' => ' + finalState);
    await page.waitForTimeout(500);
    await shot(page, `${tag}-32-voice-after-stop-en`, true);
    if (finalState === 'review') {
      const val = await page.locator('#voice-transcript').inputValue();
      rec(`${tag}/voice/transcript-review-bubble`, 'PASS', `transcript="${val.slice(0, 80)}" autoSend=${await voice.getByText('Sending automatically').count()}`);
      // edit to cancel auto-send so we do not post garbage
      await page.locator('#voice-transcript').fill('test');
    } else if (finalState === 'error') {
      const txt = await voice.locator('[role=alert]').innerText();
      rec(`${tag}/voice/error-state-friendly`, /try again|type your question|No audio|did not work/i.test(txt) ? 'PASS' : 'FAIL', txt.replace(/\n+/g, ' | ').slice(0, 200));
    } else rec(`${tag}/voice/final`, 'FAIL', 'no review or error within 40s');
    rec(`${tag}/voice/backend-requests`, reqs.length ? 'PASS' : 'FAIL', reqs.join(' ; ').slice(0, 500));
    await ctx.close();
  }
  // Regression
  const ctx = await browser.newContext({ ...mobile, storageState: STATE });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const p of ['/dashboard', '/scan', '/satellite', '/ussd-demo', '/alerts', '/dawai-check']) {
    const resp = await page.goto(B + p, { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const body = (await page.locator('main').innerText().catch(() => '')).length;
    rec(`regress${p}`, resp.status() === 200 && body > 100 && !/Application error|Something went wrong/i.test(await page.content()) ? 'PASS' : 'FAIL', `status=${resp.status()} mainChars=${body} url=${page.url().replace(B, '')}`);
    if (p === '/dashboard') await shot(page, 'm-40-dashboard');
  }
  // nav label: open the menu on mobile, check bottom nav + links
  await page.goto(B + '/dashboard', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Open navigation menu' }).click(); await page.waitForTimeout(600);
  await shot(page, 'm-41-nav-menu');
  const navText = await page.locator('body').innerText();
  rec('regress/nav-shows-Dawai-Check', /Dawai Check/.test(navText) ? 'PASS' : 'FAIL');
  rec('regress/pageerrors', errs.length ? 'INFO' : 'PASS', errs.slice(0, 3).join(';'));
  await ctx.close();
  const d = await browser.newContext({ ...desktop, storageState: STATE }); const dp = await d.newPage();
  await dp.goto(B + '/dashboard', { waitUntil: 'load' }); await dp.waitForTimeout(2000);
  rec('regress/desktop-nav-Dawai-Check', (await dp.getByRole('link', { name: /Dawai Check/ }).count()) ? 'PASS' : 'FAIL');
  await shot(dp, 'd-40-dashboard');
  await browser.close();
  fs.writeFileSync(`${S}/voice-out.json`, JSON.stringify(results, null, 1));
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(`${S}/voice-out.json`, JSON.stringify(results, null, 1)); process.exit(1); });
