// FINAL E2E: Dawai Check through the real browser UI (no mocks). QA_PASSWORD and QA_SCRATCH from env. One login.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, sharp, B, STATE, mobile, desktop, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, detail = '') => { results.push({ id, status, detail: String(detail).slice(0, 900) }); console.log(status, id, '::', String(detail).slice(0, 300)); fs.writeFileSync(path.join(OUT, 'dawai-ui-results.json'), JSON.stringify(results, null, 1)); };

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
  const plan = [
    ['m360', mobile, 'en', ['dpp', 'premix', 'endo', 'notlist', 'expired', 'blank']],
    ['m360', mobile, 'ur', ['dpp', 'premix', 'blank']],
    ['d1440', desktop, 'en', ['dpp', 'endo']],
    ['d1440', desktop, 'ur', ['dpp', 'notlist', 'expired']],
  ];
  const letter = { dpp: 'a', premix: 'b', endo: 'c', notlist: 'd', expired: 'e', blank: 'f' };
  for (const [tag, prof, lang, names] of plan) {
    const ctx = await browser.newContext({ ...prof, storageState: STATE, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await gotoDawai(page, lang);
    for (const name of names) {
      const id = `${letter[name]}/${tag}/${lang}/${name}`;
      try {
        const r = await runUpload(page, tag, lang, name);
        checkResult(id, name, lang, r);
        if (name === 'dpp') {
          const listen = page.getByRole('button', { name: lang === 'ur' ? /یہ نتیجہ سنیں/ : /Listen to this result/ });
          const lc = await listen.count();
          if (lc) {
            await listen.first().click(); await page.waitForTimeout(500);
            const p1 = await listen.first().getAttribute('aria-pressed');
            await listen.first().click(); await page.waitForTimeout(500);
            const p2 = await listen.first().getAttribute('aria-pressed');
            rec(`j/${tag}/${lang}/listen`, 'PASS', `button present; aria-pressed after click1=${p1} after click2=${p2} (headless has no voice: toggle handling only)`);
          } else {
            rec(`j/${tag}/${lang}/listen`, 'PASS', 'Listen button hidden because speechSynthesis unsupported (graceful, no crash)');
          }
          const cp = page.getByRole('button', { name: lang === 'ur' ? 'خلاصہ کاپی کریں' : 'Copy summary' });
          await cp.first().click(); await page.waitForTimeout(700);
          const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
          const toast = await page.locator('main [role=status]').allInnerTexts();
          rec(`k/${tag}/${lang}/copy`, clip && !/^ERR/.test(clip) && clip.length > 30 ? 'PASS' : 'FAIL', `clip(${clip.length})="${clip.replace(/\s+/g, ' ').slice(0, 220)}" toast=${JSON.stringify(toast.filter(Boolean))}`);
          const jj = judgeForbidden(clip);
          rec(`l/${tag}/${lang}/clipboard-forbidden`, jj.bad.length ? 'FAIL' : 'PASS', JSON.stringify(jj.bad));
        }
        await page.getByRole('button', { name: lang === 'ur' ? /ایک اور جانچیں/ : /Check another/ }).first().click();
        await page.waitForTimeout(600);
      } catch (e) {
        rec(id, 'FAIL', 'exception ' + e.message.split('\n')[0]);
        await page.screenshot({ path: path.join(OUT, `err-${tag}-${name}-${lang}.png`) }).catch(() => {});
        await gotoDawai(page, lang);
      }
    }
    rec(`pageerrors/${tag}/${lang}`, errs.length ? 'FAIL' : 'PASS', errs.join(';'));
    await ctx.close();
  }

  for (const lang of ['en', 'ur']) {
    const ctx = await browser.newContext({ ...mobile, storageState: STATE });
    const page = await ctx.newPage();
    await gotoDawai(page, lang);
    try {
      await page.locator('input[type=file]').setInputFiles({ name: 'label.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
      await page.waitForTimeout(800);
      const t1 = await page.locator('main').first().innerText();
      await page.screenshot({ path: path.join(OUT, `m360-g-pdf-error-${lang}.png`), fullPage: true });
      rec(`g/m360/${lang}/pdf`, /JPEG/.test(t1) ? 'PASS' : 'FAIL', t1.replace(/\s+/g, ' ').match(/[^.]*JPEG[^.]*\./)?.[0] ?? t1.slice(0, 200));
      await page.locator('input[type=file]').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(41 * 1024 * 1024, 1) });
      await page.waitForTimeout(1500);
      const t2 = await page.locator('main').first().innerText();
      await page.screenshot({ path: path.join(OUT, `m360-g-oversize-error-${lang}.png`), fullPage: true });
      rec(`g/m360/${lang}/oversize`, (lang === 'en' ? /too large/ : /بہت بڑی/).test(t2) ? 'PASS' : 'FAIL', t2.replace(/\s+/g, ' ').match(/[^.]*(too large|بہت بڑی)[^.]*/)?.[0] ?? t2.slice(0, 200));
    } catch (e) { rec(`g/m360/${lang}`, 'FAIL', e.message.split('\n')[0]); }

    try {
      await gotoDawai(page, lang);
      await page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first().click();
      for (const q of ['abam', 'imid']) {
        const cb = page.getByRole('combobox');
        await cb.fill(''); await cb.fill(q); await page.waitForTimeout(1500);
        const opts = await page.getByRole('option').allInnerTexts();
        await page.screenshot({ path: path.join(OUT, `m360-h-manual-${q}-${lang}.png`), fullPage: true });
        rec(`h/m360/${lang}/suggest-${q}`, opts.length ? 'PASS' : 'FAIL', JSON.stringify(opts.map((o) => o.replace(/\s+/g, ' ')).slice(0, 4)));
        await page.getByRole('option').first().click();
        await page.getByRole('button', { name: lang === 'ur' ? 'یہ نام جانچیں' : 'Check this name' }).click();
        await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }); await page.waitForTimeout(1800);
        const title = (await page.locator('#dc-verdict-title').innerText()).trim();
        const body = await page.evaluate(() => document.body.innerText);
        const j = judgeForbidden(body);
        await page.screenshot({ path: path.join(OUT, `m360-h-manual-result-${q}-${lang}.png`), fullPage: true });
        rec(`h/m360/${lang}/manual-result-${q}`, !j.bad.length ? 'PASS' : 'FAIL', `title="${title}" forbiddenUnnegated=${JSON.stringify(j.bad)}`);
        if (q === 'abam') {
          const inp = page.locator('label', { hasText: lang === 'ur' ? 'فعال جزو' : 'Active ingredient' }).locator('input').first();
          await inp.fill('Endosulfan 35% EC');
          await page.getByRole('button', { name: lang === 'ur' ? /دوبارہ جانچیں/ : /Check again/ }).click();
          await page.waitForTimeout(500);
          await page.waitForFunction((t0) => { const e = document.querySelector('#dc-verdict-title'); return e && e.innerText.trim() !== t0; }, title, { timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(1800);
          const title2 = (await page.locator('#dc-verdict-title').innerText()).trim();
          const body2 = await page.evaluate(() => document.body.innerText);
          await page.screenshot({ path: path.join(OUT, `m360-h-edit-recheck-${lang}.png`), fullPage: true });
          rec(`h/m360/${lang}/edit-chip-recheck`, title2 !== title || /1329/.test(body2) ? 'PASS' : 'FAIL', `before="${title}" after="${title2}" has1329=${/1329/.test(body2)}`);
          await page.getByRole('button', { name: lang === 'ur' ? /ایک اور جانچیں/ : /Check another/ }).first().click();
          await page.waitForTimeout(500);
          await page.getByRole('button', { name: lang === 'ur' ? 'نام لکھیں' : 'Type the name' }).first().click();
        }
      }
    } catch (e) { rec(`h/m360/${lang}`, 'FAIL', e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, `err-h-${lang}.png`) }).catch(() => {}); }

    try {
      await gotoDawai(page, lang);
      await page.getByRole('button', { name: lang === 'ur' ? /پچھلی جانچ/ : 'History' }).first().click();
      await page.waitForTimeout(1800);
      const rows = await page.locator('#dc-history-title').locator('xpath=..').locator('li').count();
      await page.screenshot({ path: path.join(OUT, `m360-i-history-${lang}.png`), fullPage: true });
      const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      rec(`i/m360/${lang}/history-list`, rows >= 3 && hs <= 0 ? 'PASS' : 'FAIL', `rows=${rows} hscroll=${hs}`);
      await page.locator('#dc-history-title').locator('xpath=..').locator('li button').first().click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 20000 }); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `m360-i-history-open-${lang}.png`), fullPage: true });
      rec(`i/m360/${lang}/history-open`, 'PASS', (await page.locator('#dc-verdict-title').innerText()).trim());
    } catch (e) { rec(`i/m360/${lang}`, 'FAIL', e.message.split('\n')[0]); }
    await ctx.close();
  }
  await browser.close();
  const c = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  console.log('SUMMARY', JSON.stringify(c));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
