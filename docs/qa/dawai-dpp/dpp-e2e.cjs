// REAL end-to-end for the DPP lists (no mocks): ONE login, generated label photos -> web BFF -> API -> Tesseract -> checks,
// then a Playwright screenshot pass (360x740 and 1440x900, English and Urdu) of three results opened from History.
// Run from the repo root:
//   QA_PASSWORD='...' QA_SCRATCH=<dir for state.json> node docs/qa/dawai-dpp/dpp-e2e.cjs
// Login is rate limited (5/min), uploads 30/hour, checks 10/min: this script does 1 login and 6 uploads/checks.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, sharp, B, STATE, mobile, desktop, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];

const variants = {
  'dpp-notified': ['Agrimectin 1.8 EC', 'Active ingredient: Abamectin 1.8% EC', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2411', 'Mfg: 03/2026', 'Exp: 12/2030'],
  'premix-banned': ['Ammo-phos 450 EC', 'Active ingredient: Cypermethrin 5% + Monocrotophos 40% EC', 'Company: Unknown Traders', 'Batch No: X88', 'Exp: 12/2030'],
  endosulfan: ['SuperKill 35 EC', 'Active ingredient: Endosulfan 35% EC', 'Company: Unknown Traders', 'Batch No: X77', 'Exp: 12/2030'],
  'not-on-list': ['GreenMax Super Spray', 'Active ingredient: Zorbitol 50% EC', 'Company: Nowhere Chemicals', 'Reg. No: ZB-4471', 'Exp: 12/2030'],
  expired: ['Agrimectin 1.8 EC', 'Active ingredient: Abamectin 1.8% EC', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2101', 'Mfg: 01/2022', 'Exp: 01/2024'],
  'demo-product': ['DEMO Imidacloprid 20% SL', 'Active ingredient: Imidacloprid 20% SL', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2411', 'Mfg: 03/2026', 'Exp: 12/2030'],
};
const expect = {
  'dpp-notified': (r) => r.verdict === 'VERIFIED' && r.listCoverage === 'DPP_PARTIAL' && r.demoDataset === false && r.matchedNotified && /Abamectin/.test(r.matchedNotified.productText) && r.matchedNotified.whoClass === 'III',
  'premix-banned': (r) => r.verdict === 'HIGH_RISK' && r.bannedMatch && r.bannedMatch.kind === 'premix' && /624/.test(r.bannedMatch.notificationNumber),
  endosulfan: (r) => r.verdict === 'HIGH_RISK' && r.bannedMatch && r.bannedMatch.kind === 'ingredient' && /1329\(I\)\/2012/.test(r.bannedMatch.notificationNumber),
  'not-on-list': (r) => r.verdict === 'SUSPICIOUS' && r.matchedNotified === null && r.checks.find((c) => c.code === 'ingredient_notified').status === 'unknown' && !r.checks.some((c) => c.status === 'warn' || c.status === 'fail'),
  expired: (r) => r.checks.find((c) => c.code === 'expiry_date').status === 'fail' && r.verdict !== 'VERIFIED' && r.checks.find((c) => c.code === 'ingredient_notified').status === 'pass',
  'demo-product': (r) => r.demoDataset === true && r.listCoverage === 'DPP_PARTIAL' && r.verdict === 'VERIFIED',
};
const FORBID = /\b(genuine|authentic|approved)\b|\bsafe\b/i;

async function labelImage(lines) {
  const text = lines.map((l, i) => `<text x="60" y="${110 + i * 70}" font-family="Arial" font-size="42" fill="#111">${l.replace(/&/g, '&amp;')}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760"><rect width="100%" height="100%" fill="#f4f1e8"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

(async () => {
  await login();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STATE });
  const req = ctx.request;
  const post = (p, data) => req.post(B + p, { headers: { origin: B }, data });
  for (const [name, lines] of process.env.SKIP_E2E ? [] : Object.entries(variants)) {
    const img = await labelImage(lines);
    const pre = await post('/api/uploads/presign', { fileName: `label-${name}.jpg`, contentType: 'image/jpeg', sizeBytes: img.length, purpose: 'pesticide-label' });
    const p = await pre.json();
    const put = await req.put(p.upload.url, { headers: { 'content-type': 'image/jpeg' }, data: img });
    await post('/api/uploads/complete', { mediaId: p.media.id });
    const t0 = Date.now();
    const chk = await post('/api/pesticide-checks', { mediaAssetId: p.media.id, language: 'en' });
    const r = await chk.json();
    const ms = Date.now() - t0;
    const ok = chk.status() === 201 && Boolean(expect[name](r)) && !FORBID.test(JSON.stringify([r.explanation, r.checks.map((c) => c.detailEn)]));
    results.push({
      variant: name, http: chk.status(), put: put.status(), ms, verdict: r.verdict, score: r.score, listCoverage: r.listCoverage, demoDataset: r.demoDataset,
      read: { brand: r.extracted?.brandName, ing: r.extracted?.activeIngredient, conc: r.extracted?.concentration, form: r.extracted?.formulation, exp: r.extracted?.expiryDate },
      matchedNotified: r.matchedNotified, bannedMatch: r.bannedMatch, matchedProduct: r.matchedProduct?.brandName ?? null,
      checks: (r.checks || []).map((c) => `${c.code}:${c.status}`), explanation: r.explanation, pass: ok,
    });
    console.log(ok ? 'PASS' : 'FAIL', name, r.verdict, r.score, r.listCoverage, `${ms}ms`);
  }
  if (!process.env.SKIP_E2E) fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 1));

  // Screenshots: open the three results from History (GET only, no extra uploads).
  // Agrimectin appears twice in History (newest first: the expired label, then the notified one), so take the last.
  const shots = [['dpp-notified', 'Agrimectin', /Consistent with the DPP notified list|مطلع شدہ فہرست سے مطابقت/], ['premix-banned', 'Ammo-phos', /banned pre-mixture|ممنوعہ پری مکسچر/], ['not-on-list', 'GreenMax', /Could not confirm|تصدیق نہیں ہو سکی/]];
  const profiles = [['m360', mobile], ['d1440', desktop]];
  for (const [pname, prof] of profiles) {
    for (const lang of ['en', 'ur']) {
      const c = await browser.newContext({ ...prof, storageState: STATE });
      const page = await c.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      for (const [variant, brandText, want] of shots) {
        await page.goto(B + '/dawai-check', { waitUntil: 'load' });
        if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).click();
        await page.getByRole('button', { name: lang === 'ur' ? /پچھلی جانچ/ : 'History' }).click();
        await page.waitForTimeout(1500);
        await page.locator('li button', { hasText: brandText }).last().click();
        await page.locator('#dc-verdict-title').waitFor({ timeout: 20000 });
        await page.waitForTimeout(1800);
        const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const title = (await page.locator('#dc-verdict-title').innerText()).trim();
        const body = await page.locator('main').first().innerText();
        const file = `dpp-${pname}-${variant}-${lang}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        const ok = want.test(title) && hs <= 0 && !FORBID.test(body) && !/DEMO DATASET|ڈیمو ڈیٹا/.test(body) && errs.length === 0;
        results.push({ screenshot: file, title, hscroll: hs, pass: ok });
        console.log(ok ? 'PASS' : 'FAIL', file, '::', title, 'hscroll', hs);
      }
      await c.close();
    }
  }
  fs.writeFileSync(path.join(OUT, process.env.SKIP_E2E ? 'screenshot-results.json' : 'e2e-results.json'), JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
