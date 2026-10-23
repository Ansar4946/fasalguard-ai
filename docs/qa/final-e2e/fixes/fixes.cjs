// FIXES verification (agent W). Env: QA_PASSWORD only. One login. Screenshots are written next to this file.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, mobile, desktop, login } = require('../../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, d = '') => { results.push({ id, status, detail: String(d).slice(0, 700) }); console.log(status, id, '::', String(d).slice(0, 300)); fs.writeFileSync(path.join(OUT, 'fixes-results.json'), JSON.stringify(results, null, 1)); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
const chat = 'section[aria-labelledby=chat-heading]';
const FORB = /\b(genuine|authentic|safe to use|approved|registered|fake)\b|اصلی|مستند|محفوظ|رجسٹرڈ|جعلی/gi;
const NEG = /(does not mean|not mean|never|not being|is not|isn't|not proof|نہیں|کبھی)/i;
const forbBad = (t) => [...t.matchAll(FORB)].map((m) => t.slice(Math.max(0, m.index - 70), m.index + 60)).filter((h) => !NEG.test(h));

async function ask(page, text) {
  const before = await page.locator(`${chat} article`).count();
  await page.locator('#assistant-question').fill(text);
  await page.locator(`${chat} form button[type=submit]`).click();
  await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby=chat-heading] article').length >= n + 2, before, { timeout: 90000 });
  await page.waitForTimeout(600);
  return page.locator(`${chat} article`).last().innerText();
}
async function newConv(page) {
  const nc = page.getByRole('button', { name: /New conversation|نئی گفتگو/ });
  if (await nc.count()) await nc.first().click();
  await page.waitForTimeout(300);
}

async function dawai(browser, prof, tag) {
  for (const lang of ['en', 'ur']) {
    const ctx = await browser.newContext({ ...prof, storageState: STATE });
    const page = await ctx.newPage();
    try {
      await page.goto(B + '/dawai-check', { waitUntil: 'load' }); await page.waitForTimeout(800);
      if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).first().click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first().click();
      const cb = page.getByRole('combobox');
      await cb.fill('abam'); await page.waitForTimeout(1500);
      const opts = await page.getByRole('option').allInnerTexts();
      await shot(page, `${tag}-abam-suggest-${lang}`);
      const tagText = lang === 'ur' ? 'ڈی پی پی کی مطلع شدہ فہرست' : 'DPP notified list';
      rec(`${tag}/${lang}/suggest-abam`, opts.some((o) => /Abamectin 1\.8% EC/.test(o) && o.includes(tagText)) ? 'PASS' : 'FAIL', JSON.stringify(opts));
      await page.getByRole('option').filter({ hasText: 'Abamectin 1.8% EC' }).first().click();
      await page.waitForTimeout(300);
      const filled = await cb.inputValue();
      await page.getByRole('button', { name: lang === 'ur' ? 'یہ نام جانچیں' : 'Check this name' }).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }); await page.waitForTimeout(1800);
      const title = (await page.locator('#dc-verdict-title').innerText()).trim();
      const body = await page.evaluate(() => document.body.innerText);
      const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await shot(page, `${tag}-abam-result-${lang}`);
      const bad = forbBad(body);
      const has = lang === 'ur' ? /مطلع شدہ|ڈی پی پی/.test(body) : /Consistent with the DPP notified list/.test(body) && /DPP LIST/i.test(body);
      const who = /\bIII\b/.test(body);
      rec(`${tag}/${lang}/pick-abam-result`, has && who && !bad.length && hs <= 0 ? 'PASS' : 'FAIL', `filled="${filled}" title="${title}" dppBadge/consistent=${has} whoIII=${who} hscroll=${hs} forbidden=${JSON.stringify(bad)}`);
      await page.getByRole('button', { name: lang === 'ur' ? /ایک اور جانچیں/ : /Check another/ }).first().click(); await page.waitForTimeout(400);
      await page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first().click();
      for (const q of ['imid', 'cyper']) {
        await page.getByRole('combobox').fill(q); await page.waitForTimeout(1500);
        const o = await page.getByRole('option').allInnerTexts();
        await shot(page, `${tag}-${q}-suggest-${lang}`);
        rec(`${tag}/${lang}/suggest-${q}`, q === 'imid' ? (o.some((x) => /DEMO Imidacloprid 20% SL/.test(x)) ? 'PASS' : 'FAIL') : (o.length ? 'PASS' : 'INFO'), JSON.stringify(o.map((x) => x.replace(/\n+/g, ' / '))));
      }
    } catch (e) { rec(`${tag}/${lang}/dawai-error`, 'FAIL', e.message); }
    await ctx.close();
  }
}

async function assistant(browser, prof, tag, lang, qs) {
  const ctx = await browser.newContext({ ...prof, storageState: STATE });
  const page = await ctx.newPage();
  await page.goto(B + '/assistant', { waitUntil: 'load' });
  await page.locator('#assistant-question').waitFor({ timeout: 20000 }); await page.waitForTimeout(1500);
  if (lang === 'en') await page.getByRole('button', { name: 'English' }).first().click();
  await page.waitForTimeout(400);
  for (const [id, q, want, notWant] of qs) {
    try {
      await newConv(page);
      const a = await ask(page, q);
      await shot(page, `${tag}-${id}`);
      const ok = want ? want.test(a) && !(notWant && notWant.test(a)) : true;
      rec(`${tag}/${id}`, ok ? 'PASS' : 'FAIL', a.replace(/\n+/g, ' | ').slice(0, 260));
    } catch (e) { rec(`${tag}/${id}`, 'FAIL', e.message); }
  }
  await ctx.close();
}

async function voice(browser, prof, tag, lang, mock) {
  const ctx = await browser.newContext({ ...prof, storageState: STATE, permissions: ['microphone'] });
  const page = await ctx.newPage();
  if (mock) await page.route('**/api/assistant/speech/transcribe', (r) => r.fulfill({ status: mock.status, contentType: 'application/json', body: JSON.stringify({ error: { code: mock.code, message: mock.message } }) }));
  await page.goto(B + '/assistant', { waitUntil: 'load' });
  await page.locator('#voice-heading').waitFor({ timeout: 20000 }); await page.waitForTimeout(2500);
  if (lang === 'en') await page.getByRole('button', { name: 'English' }).first().click();
  const v = page.locator('section[aria-labelledby=voice-heading]');
  const box = v.locator('input[type=checkbox]');
  if (!(await box.isChecked())) { await box.click(); await page.waitForTimeout(1500); }
  await v.getByRole('button', { name: lang === 'en' ? 'Start recording' : 'ریکارڈنگ شروع کریں' }).click();
  await v.getByRole('button', { name: lang === 'en' ? 'Stop recording' : 'ریکارڈنگ روکیں' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await v.getByRole('button', { name: lang === 'en' ? 'Stop recording' : 'ریکارڈنگ روکیں' }).click();
  await v.locator('[role=alert], #voice-transcript').first().waitFor({ timeout: 70000 }).catch(() => {});
  const al = await v.locator('[role=alert]').innerText().catch(() => '');
  await shot(page, `${tag}-voice-${mock ? mock.name : 'real'}-${lang}`);
  const latinSentence = /[A-Za-z]{4,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(al);
  const status = !al ? 'INFO' : lang === 'ur' && latinSentence ? 'FAIL' : 'PASS';
  rec(`${tag}/${lang}/voice-${mock ? mock.name : 'real'}`, status, `alert="${al.replace(/\n+/g, ' | ')}"`);
  await ctx.close();
}

(async () => {
  await login();
  const plain = await chromium.launch();
  await dawai(plain, mobile, 'm360-h');
  const rice = [['ur-rice', 'چاول کی فصل کو پانی کب اور کتنا دینا چاہیے؟', /دھان میں پانی کا انتظام/, /کپاس/],
    ['ur-rice-dhaan', 'دھان کی فصل میں پانی کا انتظام کیسے کریں؟', /دھان میں پانی کا انتظام/, /کپاس/],
    ['ur-rice-chawal-mgmt', 'چاول کی فصل میں پانی کا انتظام کیسے کریں؟', /دھان میں پانی کا انتظام/, /کپاس/],
    ['ur-cotton', 'کپاس کی فصل کو پانی کب دینا چاہیے؟', /کپاس کی آبپاشی/, /دھان/],
    ['ur-wheat', 'میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟', /گندم کے کھیت کی نگرانی/, null],
    ['ur-offtopic', 'فرانس کا دارالحکومت کیا ہے؟', /منظور شدہ رہنمائی پر مبنی جواب موجود نہیں/, null]];
  await assistant(plain, mobile, 'm360-p', 'ur', rice);
  await assistant(plain, desktop, 'd1440-p', 'ur', rice.slice(0, 1));
  await assistant(plain, mobile, 'm360-p', 'en', [
    ['en-wheat', 'Why are my wheat leaves turning yellow?', /Wheat field scouting/, null],
    ['en-cotton', 'When should I irrigate cotton?', /Cotton irrigation/, /Rice|Wheat/],
    ['en-offtopic', 'What is the capital of France?', /do not have approved guidance/, null]]);
  await plain.close();
  const beep = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  await voice(beep, desktop, 'd1440', 'ur', null);
  const mocks = [
    { name: 'nospeech', status: 503, code: 'SPEECH_NO_SPEECH', message: 'No speech was detected. Please record again.' },
    { name: 'provider', status: 503, code: 'SPEECH_PROVIDER_FAILED', message: 'Transcription failed.' },
    { name: 'ratelimit', status: 429, code: 'TOO_MANY_REQUESTS', message: 'ThrottlerException: Too Many Requests' },
    { name: 'format', status: 503, code: 'SPEECH_MEDIA_INVALID', message: 'Voice recording format is unsupported.' }];
  for (const m of mocks) await voice(beep, mobile, 'm360', 'ur', m);
  await voice(beep, mobile, 'm360', 'en', mocks[0]);
  await beep.close();
  console.log('SUMMARY', JSON.stringify(results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {})));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
