// FINAL E2E: Dawai Check through the real browser UI (no mocks). QA_PASSWORD and QA_SCRATCH from env. One login.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, sharp, B, STATE, mobile, desktop, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, detail = '') => { results.push({ id, status, detail: String(detail).slice(0, 900) }); console.log(status, id, '::', String(detail).slice(0, 300)); fs.writeFileSync(path.join(OUT, 'dawai-manual-results.json'), JSON.stringify(results, null, 1)); };

const V = {
  dpp: ['Agrimectin 1.8 EC', 'Active ingredient: Abamectin 1.8% EC', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2411', 'Mfg: 03/2026', 'Exp: 12/2030'],
  premix: ['Ammo-phos 450 EC', 'Active ingredient: Cypermethrin 5% + Monocrotophos 40% EC', 'Company: Unknown Traders', 'Batch No: X88', 'Exp: 12/2030'],
  endo: ['SuperKill 35 EC', 'Active ingredient: Endosulfan 35% EC', 'Company: Unknown Traders', 'Batch No: X77', 'Exp: 12/2030'],
  notlist: ['GreenMax Super Spray', 'Active ingredient: Zorbitol 50% EC', 'Company: Nowhere Chemicals', 'Reg. No: ZB-4471', 'Exp: 12/2030'],
  expired: ['Agrimectin 1.8 EC', 'Active ingredient: Abamectin 1.8% EC', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2101', 'Mfg: 01/2022', 'Exp: 01/2024'],
  blank: [],
};
async function img(name) {
  if (name === 'blank') return sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 8, g: 8, b: 8 } } }).jpeg().toBuffer();
  const text = V[name].map((l, i) => `<text x="60" y="${110 + i * 70}" font-family="Arial" font-size="42" fill="#111">${l.replace(/&/g, '&amp;')}</text>`).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760"><rect width="100%" height="100%" fill="#f4f1e8"/>${text}</svg>`)).jpeg({ quality: 88 }).toBuffer();
}
const FORB_EN = /\b(genuine|authentic|safe to use|approved|registered|fake)\b/gi;
const FORB_UR = /(اصلی|مستند|محفوظ|منظور شدہ|رجسٹرڈ|جعلی|سچا)/g;
function forbidden(text) {
  const hits = [];
  for (const re of [FORB_EN, FORB_UR]) {
    for (const m of text.matchAll(re)) {
      const s = Math.max(0, m.index - 70), e = Math.min(text.length, m.index + 60);
      hits.push(text.slice(s, e).replace(/\s+/g, ' '));
    }
  }
  return hits;
}
const NEG = /(does not mean|not mean|never|not being|is not|isn't|نہیں|کبھی)/i;
function judgeForbidden(text) {
  const hits = forbidden(text);
  const bad = hits.filter((h) => !NEG.test(h));
  return { hits, bad };
}
const lngBtn = (page, lang) => page.getByRole('button', { name: lang === 'ur' ? 'اردو' : 'English' }).first();

async function gotoDawai(page, lang) {
  await page.goto(B + '/dawai-check', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  if (lang === 'ur') await lngBtn(page, 'ur').click();
  await page.waitForTimeout(300);
}
async function runUpload(page, tag, lang, name) {
  const f = path.join(process.env.QA_SCRATCH, `final-${name}.jpg`);
  fs.writeFileSync(f, await img(name));
  await page.locator('input[type=file]').setInputFiles(f);
  await page.waitForTimeout(900);
  await page.locator('.sticky button, section button.w-full').filter({ hasText: /Check this label|اس لیبل کو جانچیں/ }).last().click();
  await page.locator('#dc-verdict-title').waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);
  const title = (await page.locator('#dc-verdict-title').innerText()).trim();
  const body = await page.evaluate(() => document.body.innerText);
  const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const ring = await page.locator('section[aria-labelledby=dc-verdict-title] [role=img]').count();
  const shot = `${tag}-${name}-${lang}.png`;
  await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
  return { title, body, hs, ring, shot };
}
const expect = {
  dpp: { en: [/Consistent with the DPP notified list/i, /DPP LIST \(PARTIAL, 2005\)/, /\bIII\b/], ur: [/مطلع شدہ|ڈی پی پی/] },
  premix: { en: [/High risk/i, /624\(I\)\/96/], ur: [/زیادہ خطرہ/, /624/] },
  endo: { en: [/High risk/i, /1329\(I\)\/2012/], ur: [/زیادہ خطرہ/, /1329/] },
  notlist: { en: [/could not confirm/i], ur: [/تصدیق نہیں/] },
  expired: { en: [/expir/i], ur: [/میعاد|ختم/] },
  blank: { en: [/could not read/i], ur: [/پڑھ نہیں/] },
};
function checkResult(id, name, lang, r) {
  const exps = expect[name][lang];
  const miss = exps.filter((re) => !re.test(r.title + '\n' + r.body)).map(String);
  const j = judgeForbidden(r.body);
  const extra = [];
  if (name === 'notlist' && /unregistered|\bfake\b|جعلی/i.test(r.body) && j.bad.length) extra.push('not-on-list described as fake');
  if (name === 'blank' && r.ring !== 0) extra.push('risk ring present on blank');
  if (name !== 'blank' && r.ring !== 1) extra.push('ring count ' + r.ring);
  if (name === 'blank' && !/retake|clearer|light|closer|steady|دوبارہ|روشنی/i.test(r.body)) extra.push('no retake tip');
  const ok = !miss.length && !j.bad.length && !extra.length && r.hs <= 0;
  rec(id, ok ? 'PASS' : 'FAIL', `title="${r.title}" hscroll=${r.hs} missing=${JSON.stringify(miss)} forbiddenUnnegated=${JSON.stringify(j.bad)} forbiddenNegatedCount=${j.hits.length - j.bad.length} extra=${extra} shot=${r.shot}`);
}
(async () => {
  await login();
  const browser = await chromium.launch();
  for (const lang of ['en', 'ur']) {
    const ctx = await browser.newContext({ ...mobile, storageState: STATE });
    const page = await ctx.newPage();
    const typeBtn = () => page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first();
    const newBtn = () => page.getByRole('button', { name: lang === 'ur' ? /ایک اور جانچیں/ : /Check another/ }).first();
    try {
      await gotoDawai(page, lang);
      await typeBtn().click();
      const cb = page.getByRole('combobox');
      // abam: no catalogue suggestion expected (DPP list has no brands); type full name and submit
      await cb.fill('abam'); await page.waitForTimeout(1500);
      const o1 = await page.getByRole('option').allInnerTexts();
      const msg = await page.locator('main').first().innerText();
      await page.screenshot({ path: path.join(OUT, `m360-h-manual-abam-${lang}.png`), fullPage: true });
      rec(`h/m360/${lang}/suggest-abam`, o1.length ? 'PASS' : 'FAIL', `options=${JSON.stringify(o1)} (API /pesticide-products?search=abam returns [])`);
      await cb.fill('Abamectin 1.8 EC'); await page.waitForTimeout(800);
      await page.getByRole('button', { name: lang === 'ur' ? 'یہ نام جانچیں' : 'Check this name' }).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }); await page.waitForTimeout(1800);
      const title = (await page.locator('#dc-verdict-title').innerText()).trim();
      const body = await page.evaluate(() => document.body.innerText);
      const j = judgeForbidden(body);
      await page.screenshot({ path: path.join(OUT, `m360-h-manual-result-typed-${lang}.png`), fullPage: true });
      rec(`h/m360/${lang}/manual-result-typed-abamectin`, !j.bad.length ? 'PASS' : 'FAIL', `title="${title}" forbiddenUnnegated=${JSON.stringify(j.bad)}`);
      const inp = page.locator('label', { hasText: lang === 'ur' ? 'فعال جزو' : 'Active ingredient' }).locator('input').first();
      await inp.fill('Endosulfan 35% EC');
      await page.getByRole('button', { name: lang === 'ur' ? /دوبارہ جانچیں/ : /Check again/ }).click();
      await page.waitForFunction((t0) => { const e = document.querySelector('#dc-verdict-title'); return e && e.innerText.trim() !== t0; }, title, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const title2 = (await page.locator('#dc-verdict-title').innerText()).trim();
      const body2 = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: path.join(OUT, `m360-h-edit-recheck-${lang}.png`), fullPage: true });
      rec(`h/m360/${lang}/edit-chip-recheck`, title2 !== title && /1329/.test(body2) ? 'PASS' : 'FAIL', `before="${title}" after="${title2}" has1329=${/1329/.test(body2)}`);
      await newBtn().click(); await page.waitForTimeout(500);
      await typeBtn().click();
      await cb.fill(''); await cb.fill('imid'); await page.waitForTimeout(1500);
      const o2 = await page.getByRole('option').allInnerTexts();
      await page.screenshot({ path: path.join(OUT, `m360-h-manual-imid-${lang}.png`), fullPage: true });
      rec(`h/m360/${lang}/suggest-imid`, o2.length ? 'PASS' : 'FAIL', JSON.stringify(o2.map((o) => o.replace(/\s+/g, ' '))));
      await page.getByRole('option').first().click();
      await page.getByRole('button', { name: lang === 'ur' ? 'یہ نام جانچیں' : 'Check this name' }).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }); await page.waitForTimeout(1800);
      const t3 = (await page.locator('#dc-verdict-title').innerText()).trim();
      const j3 = judgeForbidden(await page.evaluate(() => document.body.innerText));
      await page.screenshot({ path: path.join(OUT, `m360-h-manual-result-imid-${lang}.png`), fullPage: true });
      rec(`h/m360/${lang}/manual-result-imid`, !j3.bad.length ? 'PASS' : 'FAIL', `title="${t3}" forbiddenUnnegated=${JSON.stringify(j3.bad)}`);
    } catch (e) { rec(`h/m360/${lang}`, 'FAIL', String(e.message).slice(0, 160)); await page.screenshot({ path: path.join(OUT, `err-h-${lang}.png`) }).catch(() => {}); }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
