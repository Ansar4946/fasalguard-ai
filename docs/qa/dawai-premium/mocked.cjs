// Visual + behaviour pass for the premium Dawai Check UI. BFF responses are MOCKED (no uploads/quota used).
// Run from the repo root: QA_SCRATCH=<dir with state.json> node docs/qa/dawai-premium/mocked.cjs
// Screenshots are saved as MOCKED-<tag>-<name>-<lang>.png in this folder.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, label, mobile, desktop } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const SCRATCH = process.env.QA_SCRATCH || OUT;
const results = [];
const rec = (id, status, detail = '') => { results.push({ id, status, detail: String(detail).slice(0, 500) }); console.log(`${status} ${id} :: ${String(detail).slice(0, 220)}`); };

const checkSet = {
  verified: [
    { code: 'name', status: 'pass', titleEn: 'Product name found in the list', titleUr: 'دوا کا نام فہرست میں ملا', detailEn: 'The name matches an entry in the demo list.', detailUr: 'نام ڈیمو فہرست کے ایک اندراج سے ملتا ہے۔' },
    { code: 'reg', status: 'pass', titleEn: 'Registration number looks right', titleUr: 'رجسٹریشن نمبر درست لگتا ہے', detailEn: 'DPP-12345 matches the listed product.', detailUr: 'DPP-12345 درج دوا سے ملتا ہے۔' },
    { code: 'expiry', status: 'pass', titleEn: 'Expiry date is in the future', titleUr: 'تاریخِ اختتام آگے ہے', detailEn: 'Expires 12/2030.', detailUr: 'دسمبر 2030 میں ختم ہوگی۔' },
  ],
  expired: [
    { code: 'expiry', status: 'fail', titleEn: 'Product is expired', titleUr: 'دوا کی مدت ختم ہو چکی', detailEn: 'The expiry date 01/2024 has passed. Do not use an expired product.', detailUr: 'تاریخِ اختتام 01/2024 گزر چکی ہے۔' },
    { code: 'reg', status: 'warn', titleEn: 'Registration number missing', titleUr: 'رجسٹریشن نمبر نہیں ملا', detailEn: 'No registration number could be read.', detailUr: 'کوئی رجسٹریشن نمبر نہیں پڑھا جا سکا۔' },
    { code: 'conf', status: 'unknown', titleEn: 'Photo clarity could not be judged', titleUr: 'تصویر کی صفائی معلوم نہیں', detailEn: '', detailUr: '' },
    { code: 'name', status: 'pass', titleEn: 'Product name found in the list', titleUr: 'دوا کا نام فہرست میں ملا', detailEn: 'The name matches an entry in the demo list.', detailUr: 'نام ڈیمو فہرست کے ایک اندراج سے ملتا ہے۔' },
  ],
  banned: [
    { code: 'banned', status: 'fail', titleEn: 'Ingredient on the banned list', titleUr: 'جزو ممنوعہ فہرست میں ہے', detailEn: 'Endosulfan appears on the banned-ingredient list.', detailUr: 'اینڈوسلفان ممنوعہ فہرست میں ہے۔' },
    { code: 'name', status: 'warn', titleEn: 'Product name not in the list', titleUr: 'نام فہرست میں نہیں', detailEn: '', detailUr: '' },
  ],
  blank: [],
};
const fixtures = {
  verified: { verdict: 'VERIFIED', score: 0, demo: true, brand: 'DEMO Imidacloprid 20% SL', match: true },
  expired: { verdict: 'SUSPICIOUS', score: 55, demo: true, brand: 'DEMO Imidacloprid 20% SL', match: true },
  banned: { verdict: 'HIGH_RISK', score: 100, demo: true, brand: 'SuperKill 35 EC', match: false },
  blank: { verdict: 'UNREADABLE', score: 0, demo: false, brand: '', match: false },
};
function result(variant, lang) {
  const f = fixtures[variant];
  return {
    id: `mock-${variant}`, createdAt: new Date().toISOString(), inputMode: 'photo', language: lang, verdict: f.verdict, score: f.score, demoDataset: f.demo,
    extracted: f.brand ? { brandName: f.brand, activeIngredient: variant === 'banned' ? 'Endosulfan 35% EC' : 'Imidacloprid 20% SL', concentration: '20%', formulation: 'SL', company: 'Demo AgroChem Pvt Ltd', registrationNo: variant === 'expired' ? null : 'DPP-12345', batchNo: 'B2411', manufacturingDate: '03/2026', expiryDate: variant === 'expired' ? '2024-01-01' : '2030-12-01', confidence: 0.9 } : {},
    matchedProduct: f.match ? { id: 'p1', brandName: 'DEMO Imidacloprid 20% SL', activeIngredient: 'Imidacloprid', concentration: '20% SL', company: 'Demo AgroChem Pvt Ltd', similarity: 0.97 } : null,
    checks: checkSet[variant], explanation: '', disclaimer: { en: '', ur: '' },
  };
}
const historyItems = () => {
  const now = Date.now();
  return [
    { id: 'mock-verified', createdAt: new Date(now - 3 * 60e3).toISOString(), verdict: 'VERIFIED', score: 0, demoDataset: true, brandName: 'DEMO Imidacloprid 20% SL' },
    { id: 'mock-expired', createdAt: new Date(now - 5 * 3600e3).toISOString(), verdict: 'SUSPICIOUS', score: 55, demoDataset: true, brandName: 'DEMO Imidacloprid 20% SL' },
    { id: 'mock-banned', createdAt: new Date(now - 26 * 3600e3).toISOString(), verdict: 'HIGH_RISK', score: 100, demoDataset: true, brandName: 'SuperKill 35 EC' },
    { id: 'mock-blank', createdAt: new Date(now - 12 * 86400e3).toISOString(), verdict: 'UNREADABLE', score: 0, demoDataset: false, brandName: null },
  ];
};
const products = [
  { id: 'p1', brandName: 'DEMO Imidacloprid 20% SL', activeIngredient: 'Imidacloprid', company: 'Demo AgroChem Pvt Ltd' },
  { id: 'p2', brandName: 'DEMO Imidacloprid 70% WG', activeIngredient: 'Imidacloprid', company: 'Demo Crop Care' },
];

async function mock(page, state) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/uploads/presign', async (route) => { await new Promise((r) => setTimeout(r, state.presignDelay ?? 1500)); json(route, { media: { id: 'mock-media' }, upload: { url: B + '/__mock-put', headers: {} } }); });
  await page.route('**/__mock-put', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/uploads/complete', (route) => json(route, {}));
  await page.route(/\/api\/pesticide-products\?/, (route) => json(route, products));
  await page.route(/\/api\/pesticide-checks(\/[^?]*)?(\?.*)?$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const lang = state.lang;
    if (req.method() === 'GET') {
      if (url.pathname.endsWith('/pesticide-checks')) return json(route, state.emptyHistory ? [] : historyItems());
      const id = decodeURIComponent(url.pathname.split('/').pop());
      return json(route, result(id.replace('mock-', ''), lang));
    }
    if (url.pathname.endsWith('/manual')) { await new Promise((r) => setTimeout(r, 600)); return json(route, result(state.variant, lang)); }
    await new Promise((r) => setTimeout(r, state.checkDelay ?? 4000));
    return json(route, result(state.variant, lang));
  });
}

async function metrics(page) {
  return page.evaluate(() => ({
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select')].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (e.type === 'file' || e.classList.contains('sr-only') || r.width === 0 || r.height === 0 || cs.visibility === 'hidden') return false;
      if (e.closest('aside, header.sticky, [class*="fixed"]') && !e.closest('[lang][dir]')) return false; // app shell is out of scope
      return r.height < 43.5 || (e.tagName !== 'A' && r.width < 43.5 && !e.closest('[role=group]'));
    }).map((e) => ((e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 28)) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)),
    dir: document.querySelector('[lang][dir]')?.getAttribute('dir'),
  }));
}

(async () => {
  const browser = await chromium.launch();
  const FORBID = /\b(genuine|authentic|safe to use|is safe|100% safe)\b/i;
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    for (const lang of ['en', 'ur']) {
      const ctx = await browser.newContext({ ...opts, storageState: STATE });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console:' + m.text()); });
      const state = { variant: 'verified', lang };
      await mock(page, state);
      const shot = (name, full = true) => page.screenshot({ path: path.join(OUT, `MOCKED-${tag}-${name}-${lang}.png`), fullPage: full });
      const tid = `${tag}/${lang}`;
      await page.goto(B + '/dawai-check', { waitUntil: 'load' });
      if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).click();
      await page.waitForTimeout(900);
      await shot('01-capture-idle');
      let m = await metrics(page);
      rec(`${tid}/capture-idle/layout`, m.hscroll <= 0 && (tag === 'd' || m.small.length === 0) && m.dir === (lang === 'ur' ? 'rtl' : 'ltr') ? 'PASS' : 'FAIL', JSON.stringify(m));
      // demo chip
      await page.getByRole('button', { name: /DEMO DATASET|ڈیمو ڈیٹا/ }).first().click();
      await page.waitForTimeout(400);
      await shot('02-capture-demo-note', false);
      await page.getByRole('button', { name: /DEMO DATASET|ڈیمو ڈیٹا/ }).first().click();

      // photo chosen (good + dark quality hint)
      const good = path.join(SCRATCH, 'label-verified.jpg'); fs.writeFileSync(good, await label('verified'));
      await page.locator('input[type=file]').setInputFiles(good);
      await page.waitForTimeout(900);
      await shot('03-photo-chosen');
      m = await metrics(page);
      rec(`${tid}/photo-chosen/layout`, m.hscroll <= 0 && (tag === 'd' || m.small.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(m));
      const hintText = await page.locator('[role=status].dc-view-in').first().innerText().catch(() => '');
      rec(`${tid}/quality-hint`, 'INFO', `good label hint="${hintText}"`);

      // dark photo hint
      await page.getByRole('button', { name: lang === 'ur' ? 'دوبارہ تصویر لیں' : 'Retake' }).click();
      const dark = path.join(SCRATCH, 'label-blank.jpg'); fs.writeFileSync(dark, await label('blank'));
      await page.locator('input[type=file]').setInputFiles(dark);
      await page.waitForTimeout(900);
      if (lang === 'en') {
        const h = await page.locator('[role=status].dc-view-in').first().innerText().catch(() => '');
        rec(`${tid}/quality-hint-dark`, /dark/i.test(h) ? 'PASS' : 'FAIL', h);
        await shot('04-photo-dark-hint', false);
      }
      await page.getByRole('button', { name: lang === 'ur' ? 'دوبارہ تصویر لیں' : 'Retake' }).click();

      // bad file type error inline
      if (lang === 'en') {
        const txt = path.join(SCRATCH, 'not-image.txt'); fs.writeFileSync(txt, 'hello');
        await page.locator('input[type=file]').setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
        await page.waitForTimeout(400);
        rec(`${tid}/bad-file-error`, (await page.getByRole('alert').first().innerText()).includes('JPEG') ? 'PASS' : 'FAIL');
        await shot('05-file-error', false);
      }

      // analysing + results for each verdict
      for (const variant of ['verified', 'expired', 'banned', 'blank']) {
        state.variant = variant; state.lang = lang;
        if (variant !== 'verified' || lang !== 'en' || true) {
          const f = path.join(SCRATCH, `label-${variant}.jpg`); fs.writeFileSync(f, await label(variant));
          await page.locator('input[type=file]').setInputFiles(f);
          await page.waitForTimeout(500);
        }
        await page.locator('.sticky button, section button.w-full').filter({ hasText: /Check this label|لیبل کو جانچیں/ }).last().click();
        if (variant === 'verified') {
          await page.waitForTimeout(500);
          await shot('06-analysing-upload', false);
          await page.waitForTimeout(1700);
          await shot('07-analysing-server', false);
        }
        await page.locator('#dc-verdict-title').waitFor({ timeout: 20000 });
        // count-up sampling
        const early = variant === 'expired' ? await page.locator('[role=img] + span, .size-20 span[aria-hidden]').first().innerText().catch(() => '') : '';
        await page.waitForTimeout(1900);
        await shot(`08-result-${variant}`);
        if (tag === 'm') await page.screenshot({ path: path.join(OUT, `MOCKED-${tag}-08-result-${variant}-viewport-${lang}.png`) });
        m = await metrics(page);
        const body = await page.locator('main').first().innerText().catch(() => '');
        rec(`${tid}/result-${variant}/layout`, m.hscroll <= 0 && (tag === 'd' || m.small.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(m));
        rec(`${tid}/result-${variant}/wording`, FORBID.test(body) ? 'FAIL' : 'PASS');
        const title = (await page.locator('#dc-verdict-title').innerText()).trim();
        const ring = await page.locator('section[aria-labelledby=dc-verdict-title] [role=img]').count();
        rec(`${tid}/result-${variant}/hero`, 'INFO', `title="${title}" ring=${ring} earlyCount="${early}"`);
        if (variant === 'verified' && lang === 'en') rec(`${tid}/verified-wording`, /Consistent with the demo list/.test(title) ? 'PASS' : 'FAIL', title);
        if (variant === 'blank') rec(`${tid}/blank-no-ring`, ring === 0 ? 'PASS' : 'FAIL');
        if (variant === 'expired') {
          // expand a collapsed check, collapse an open one
          const btns = page.locator('#dc-checks-title').locator('xpath=..').locator('button[aria-expanded]');
          const n = await btns.count();
          const states = [];
          for (let i = 0; i < n; i++) states.push(await btns.nth(i).getAttribute('aria-expanded'));
          rec(`${tid}/checks-expand-defaults`, states[0] === 'true' && states.slice(1).every((s) => s === 'false') ? 'PASS' : 'FAIL', states.join(','));
          await btns.nth(1).click(); await page.waitForTimeout(350);
          rec(`${tid}/checks-toggle`, (await btns.nth(1).getAttribute('aria-expanded')) === 'true' ? 'PASS' : 'FAIL');
          await page.getByRole('button', { name: /How we scored this|ہم نے اسکور کیسے نکالا/ }).click(); await page.waitForTimeout(350);
          await page.locator('#dc-how-title').scrollIntoViewIfNeeded();
          await shot('09-result-expanded');
          // edit a chip -> Edited tag + recheck enabled
          const brandInput = page.locator('#dc-read-title').locator('xpath=../..').locator('input').first();
          await brandInput.fill('Changed Name');
          await page.waitForTimeout(200);
          const recheckBtn = page.getByRole('button', { name: /Check again|دوبارہ جانچیں/ });
          rec(`${tid}/edit-enables-recheck`, (await recheckBtn.isEnabled()) ? 'PASS' : 'FAIL');
          await shot('10-result-edited', false);
          // copy summary
          await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
          await page.getByRole('button', { name: /Copy summary|خلاصہ کاپی کریں/ }).click();
          await page.waitForTimeout(500);
          const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => 'ERR'));
          rec(`${tid}/copy-summary`, clip && clip !== 'ERR' && /Product is expired|دوا کی مدت/.test(clip) ? 'PASS' : 'FAIL', clip.slice(0, 120).replace(/\n/g, ' | '));
          await shot('11-copied-toast', false);
        }
        await page.getByRole('button', { name: /Check another|ایک اور جانچیں/ }).click();
        await page.waitForTimeout(400);
      }

      // manual tab
      await page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first().click();
      await page.waitForTimeout(500);
      await shot('12-manual-empty');
      const combo = page.getByRole('combobox');
      await combo.fill('imid');
      await page.waitForTimeout(900);
      await shot('13-manual-suggestions');
      rec(`${tid}/manual-suggestions`, (await page.locator('[role=option] mark').count()) > 0 ? 'PASS' : 'FAIL', 'highlighted marks=' + (await page.locator('[role=option] mark').count()));
      await combo.press('ArrowDown'); await combo.press('Enter');
      rec(`${tid}/manual-pick`, (await combo.inputValue()).startsWith('DEMO Imidacloprid') ? 'PASS' : 'FAIL', await combo.inputValue());
      await page.getByRole('button', { name: /Clear|صاف کریں/ }).click();
      await page.getByRole('button', { name: 'DEMO Imidacloprid 20% SL' }).click();
      rec(`${tid}/manual-example-chip`, (await combo.inputValue()) === 'DEMO Imidacloprid 20% SL' ? 'PASS' : 'FAIL');
      m = await metrics(page);
      rec(`${tid}/manual/layout`, m.hscroll <= 0 && (tag === 'd' || m.small.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(m));
      state.variant = 'verified';
      await page.getByRole('button', { name: /Check this name|یہ نام جانچیں/ }).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 15000 });
      await page.waitForTimeout(1900);
      await shot('14-manual-result');
      await page.getByRole('button', { name: /Check another|ایک اور جانچیں/ }).click();

      // history
      await page.getByRole('button', { name: lang === 'ur' ? 'پچھلی جانچ' : 'History' }).click();
      await page.waitForTimeout(900);
      await shot('15-history');
      m = await metrics(page);
      rec(`${tid}/history/layout`, m.hscroll <= 0 && (tag === 'd' || m.small.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(m));
      const rows = await page.locator('#dc-history-title').locator('xpath=..').locator('li').count();
      rec(`${tid}/history/rows`, rows === 4 ? 'PASS' : 'FAIL', 'rows=' + rows);
      await page.locator('#dc-history-title').locator('xpath=..').locator('li button').nth(1).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 10000 });
      rec(`${tid}/history/open-item`, 'PASS');
      await page.getByRole('button', { name: /Check another|ایک اور جانچیں/ }).click();
      // empty history
      state.emptyHistory = true;
      await page.getByRole('button', { name: lang === 'ur' ? 'پچھلی جانچ' : 'History' }).click();
      await page.waitForTimeout(900);
      await shot('16-history-empty');
      rec(`${tid}/pageerrors`, errs.length ? 'FAIL' : 'PASS', errs.join(';'));
      await ctx.close();
    }
  }

  // reduced motion + keyboard focus order (mobile, English)
  {
    const ctx = await browser.newContext({ ...mobile, storageState: STATE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const state = { variant: 'expired', lang: 'en', checkDelay: 800, presignDelay: 200 };
    await mock(page, state);
    await page.goto(B + '/dawai-check', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const anim = await page.evaluate(() => {
      const beam = document.querySelector('.dc-beam');
      const br = document.querySelector('.dc-bracket');
      return { beam: beam ? getComputedStyle(beam).display : 'none-missing', bracketAnim: br ? getComputedStyle(br).animationName : 'missing' };
    });
    rec('reduced-motion/idle', anim.beam === 'none' && anim.bracketAnim === 'none' ? 'PASS' : 'FAIL', JSON.stringify(anim));
    await page.screenshot({ path: path.join(OUT, 'MOCKED-m-reduced-motion-idle-en.png'), fullPage: true });
    const f = path.join(SCRATCH, 'label-expired.jpg'); fs.writeFileSync(f, await label('expired'));
    await page.locator('input[type=file]').setInputFiles(f);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Check this label' }).click();
    await page.locator('#dc-verdict-title').waitFor({ timeout: 15000 });
    await page.waitForTimeout(120);
    const immediate = await page.evaluate(() => {
      const arc = document.querySelector('.dc-ring-arc');
      const num = document.querySelector('section[aria-labelledby=dc-verdict-title] [role=img] span')?.textContent;
      return { num, arcAnim: getComputedStyle(arc).animationName, offset: getComputedStyle(arc).strokeDashoffset, rise: getComputedStyle(document.querySelector('.dc-rise')).opacity };
    });
    rec('reduced-motion/result-final-state-immediately', immediate.num === '55' && immediate.arcAnim === 'none' && immediate.rise === '1' ? 'PASS' : 'FAIL', JSON.stringify(immediate));
    await page.screenshot({ path: path.join(OUT, 'MOCKED-m-reduced-motion-result-en.png'), fullPage: true });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ ...desktop, storageState: STATE });
    const page = await ctx.newPage();
    await mock(page, { variant: 'verified', lang: 'en' });
    await page.goto(B + '/dawai-check', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.locator('h1').evaluate((h) => h.closest('header').previousElementSibling ?? h);
    await page.evaluate(() => { const h = document.querySelector('h1'); h.setAttribute('tabindex', '-1'); h.focus(); h.removeAttribute('tabindex'); });
    const order = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const e = document.activeElement; const r = e.getBoundingClientRect(); const own = getComputedStyle(e).outlineStyle; return ((e.innerText || e.getAttribute('aria-label') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 26)) + (own === 'none' ? ' [NO OUTLINE]' : ''); }));
    }
    rec('keyboard/focus-order', 'INFO', order.join(' > '));
    const inPage = order.slice(0, 11); rec('keyboard/focus-visible-outline', inPage.some((o) => o.includes('NO OUTLINE')) ? 'FAIL' : 'PASS', 'in-page items only (shell skip link excluded)');
    await page.screenshot({ path: path.join(OUT, 'MOCKED-d-keyboard-focus-en.png'), fullPage: false });
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'mocked-results.json'), JSON.stringify(results, null, 1));
  await browser.close();
  const fails = results.filter((r) => r.status === 'FAIL');
  console.log(`DONE total=${results.length} fail=${fails.length}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
