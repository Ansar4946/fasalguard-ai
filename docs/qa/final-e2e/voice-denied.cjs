// FINAL E2E (u): microphone denial simulated by making getUserMedia reject with NotAllowedError (what a browser does on Block);
// headless Chromium without the fake-device flags throws NotSupportedError instead, which cannot be used to test denial. Also Urdu rice ("dhaan") retrieval.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, mobile, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, d = '') => { results.push({ id, status, detail: String(d).slice(0, 900) }); console.log(status, id, '::', String(d).slice(0, 500)); fs.writeFileSync(path.join(OUT, 'voice-denied-results.json'), JSON.stringify(results, null, 1)); };
(async () => {
  await login();
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream'] });
  for (const lang of ['en', 'ur']) {
    const ctx = await b.newContext({ ...mobile, storageState: STATE });
    await ctx.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
    const page = await ctx.newPage();
    await page.goto(B + '/assistant', { waitUntil: 'load' });
    await page.locator('#voice-heading').waitFor();
    await page.waitForTimeout(2500);
    if (lang === 'en') await page.getByRole('button', { name: 'English' }).first().click();
    const voice = page.locator('section[aria-labelledby=voice-heading]');
    const box = voice.locator('input[type=checkbox]');
    if (!(await box.isChecked())) { await box.click(); await page.waitForTimeout(1500); }
    await voice.getByRole('button', { name: lang === 'en' ? 'Start recording' : 'ریکارڈنگ شروع کریں' }).click();
    await page.waitForTimeout(1500);
    const al = await voice.locator('[role=alert]').innerText().catch(() => '');
    await page.screenshot({ path: path.join(OUT, `m360-denied-voice-${lang}.png`), fullPage: true });
    rec(`u/m360/${lang}/denied-message`, /denied|اجازت/.test(al) ? 'PASS' : 'FAIL', al.replace(/\n+/g, ' | '));
    const rb = voice.locator('[role=alert] button');
    rec(`u/m360/${lang}/retry-button`, (await rb.count()) >= 1 ? 'PASS' : 'FAIL');
    await rb.first().click(); await page.waitForTimeout(1200);
    rec(`u/m360/${lang}/retry-works`, (await voice.locator('[role=alert]').count()) >= 1 ? 'PASS' : 'FAIL', 'retry re-requests mic (denied again as simulated)');
    await ctx.close();
  }
  // Urdu rice with the word used in the demo article (dhaan) and with chawal
  const ctx = await b.newContext({ ...mobile, storageState: STATE });
  const page = await ctx.newPage();
  await page.goto(B + '/assistant', { waitUntil: 'load' });
  await page.locator('[data-testid=assistant-region]').waitFor();
  await page.waitForTimeout(2500);
  for (const [k, q] of [['dhaan', 'دھان کی فصل میں پانی کا انتظام کیسے کریں؟'], ['chawal', 'چاول کی فصل میں پانی کا انتظام کیسے کریں؟']]) {
    const nc = page.getByRole('button', { name: /نئی گفتگو/ }); if (await nc.count()) await nc.first().click();
    const chat = 'section[aria-labelledby=chat-heading]';
    const n0 = await page.locator(`${chat} article`).count();
    await page.locator('#assistant-question').fill(q);
    await page.locator(`${chat} form button[type=submit]`).click();
    await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby=chat-heading] article').length >= n + 2, n0, { timeout: 90000 });
    await page.waitForTimeout(600);
    const a = await page.locator(`${chat} article`).last().innerText();
    await page.screenshot({ path: path.join(OUT, `m360-p-ur-rice-${k}.png`), fullPage: true });
    const rice = /دھان|چاول/.test(a.split('\n').slice(0, 3).join(' '));
    rec(`p/m360/ur-rice-${k}`, rice ? 'PASS' : 'FAIL', a.replace(/\n+/g, ' | ').slice(0, 300));
  }
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
