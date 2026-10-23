// Dawai Check second pass: stages, sticky bar, Listen, edit+recheck, history, manual autocomplete, Urdu, offline, backend down.
const fs = require('node:fs'); const path = require('node:path');
const { chromium, B, OUT, STATE, results, rec, label, mobile, desktop } = require('./lib.cjs');
const S = process.env.QA_SCRATCH;
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
async function upload(page, variant) {
  const p = `${S}/label-${variant}.jpg`; fs.writeFileSync(p, await label(variant));
  await page.locator('input[type=file]').setInputFiles(p); await page.waitForTimeout(800);
  await page.locator('.sticky button, section button').filter({ hasText: /.+/ }).last().click();
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...mobile, storageState: STATE });
  const page = await ctx.newPage();
  await page.goto(B + '/dawai-check', { waitUntil: 'load' });
  await shot(page, 'm-00-dawai-landing-en', true);
  await page.route('**/api/pesticide-checks', async (r) => { if (r.request().method() === 'POST') await new Promise((x) => setTimeout(x, 2500)); r.continue(); });
  fs.writeFileSync(`${S}/label-verified.jpg`, await label('verified'));
  await page.locator('input[type=file]').setInputFiles(`${S}/label-verified.jpg`); await page.waitForTimeout(800);
  await shot(page, 'm-01-capture-preview-en');
  await page.locator('.sticky button').last().click();
  const seen = []; let last = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !(await page.locator('#dc-verdict-title').count())) {
    const t = await page.locator('main').innerText().catch(() => '');
    const stages = ['Uploading photo', 'Reading the label', 'Matching the registry', 'Checking risks'].filter((s) => t.includes(s));
    const key = t.includes('Checking your pesticide') ? 'analysing' : 'other';
    if (key !== last) { last = key; seen.push(key); if (key === 'analysing') await shot(page, 'm-02-analysing-en'); }
    await page.waitForTimeout(200);
  }
  await page.locator('#dc-verdict-title').waitFor({ timeout: 60000 });
  rec('m/stage-progression', seen.includes('analysing') ? 'PASS' : 'FAIL', `screens seen: ${seen}`);
  await page.unroute('**/api/pesticide-checks');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await shot(page, 'm-04-result-viewport-top-en');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(300);
  await shot(page, 'm-05-result-viewport-bottom-en');
  const cover = await page.evaluate(() => {
    const bar = document.querySelector('.sticky.z-30'); const b = bar?.getBoundingClientRect();
    const disc = [...document.querySelectorAll('main p')].filter((p) => p.textContent.includes('risk screening')).pop();
    const l = disc?.getBoundingClientRect(); return { bar: b && [Math.round(b.top), Math.round(b.bottom)], disclaimerBottom: l && Math.round(l.bottom), vh: innerHeight };
  });
  rec('m/sticky-bar-vs-content-at-bottom', cover.bar && cover.disclaimerBottom <= cover.bar[0] + 1 ? 'PASS' : 'INFO', JSON.stringify(cover));
  const listen = page.getByRole('button', { name: 'Listen to this result' });
  rec('m/listen-button-present', (await listen.count()) ? 'PASS' : 'FAIL');
  if (await listen.count()) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await listen.click(); await page.waitForTimeout(600);
    rec('m/listen-click', 'INFO', `aria-pressed=${await listen.getAttribute('aria-pressed')} (headless Chromium may have no voices)`);
  }
  const brand = page.locator('#dc-read-title').locator('xpath=../..').locator('input').first();
  const recheckBtn = page.getByRole('button', { name: 'Check again' });
  rec('m/recheck-disabled-until-edit', (await recheckBtn.isDisabled()) ? 'PASS' : 'FAIL');
  await brand.fill('Totally Unknown Brand 9000');
  rec('m/recheck-enabled-after-edit', (await recheckBtn.isEnabled()) ? 'PASS' : 'FAIL');
  await recheckBtn.click(); await page.waitForTimeout(3500);
  const title2 = await page.locator('#dc-verdict-title').innerText();
  rec('m/recheck-result-changes', /Consistent/.test(title2) ? 'FAIL' : 'PASS', `after edit: ${title2}`);
  await shot(page, 'm-06-after-recheck-en', true);
  await page.getByRole('button', { name: 'History' }).click(); await page.waitForTimeout(1500);
  const hist = await page.locator('main').innerText();
  rec('m/history-tab', /Open result|Demo|Imidacloprid|Previous checks/i.test(hist) ? 'PASS' : 'FAIL', hist.replace(/\n+/g, ' | ').slice(0, 250));
  await shot(page, 'm-07-history-en', true);
  const openBtn = page.getByRole('button', { name: /Open result|Imidacloprid|SuperKill|GreenMax|Unknown/i }).first();
  if (await openBtn.count()) { await openBtn.click(); await page.locator('#dc-verdict-title').waitFor({ timeout: 8000 }).then(() => rec('m/history-open-item', 'PASS'), () => rec('m/history-open-item', 'FAIL')); }
  else rec('m/history-open-item', 'FAIL', 'no open button');
  await page.goto(B + '/dawai-check', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Type the name' }).first().click();
  const input = page.getByLabel('Brand name').first();
  await input.pressSequentially('imid', { delay: 80 }); await page.waitForTimeout(1500);
  const opts = await page.locator('[role=option]').allInnerTexts();
  rec('m/manual-autocomplete-imid', opts.length ? 'PASS' : 'FAIL', JSON.stringify(opts.slice(0, 4)));
  await shot(page, 'm-08-manual-autocomplete-en', true);
  if (opts.length) { await page.locator('[role=option]').first().click(); await page.waitForTimeout(300); }
  await page.getByRole('button', { name: 'Check this name' }).click();
  await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }).then(async () => rec('m/manual-check', 'PASS', await page.locator('#dc-verdict-title').innerText()), () => rec('m/manual-check', 'FAIL'));
  await shot(page, 'm-09-manual-result-en', true);
  await page.goto(B + '/dawai-check', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'اردو' }).click(); await page.waitForTimeout(300);
  await shot(page, 'm-10-dawai-landing-ur', true);
  await ctx.setOffline(true); await page.waitForTimeout(500);
  const off = await page.locator('main').innerText();
  rec('m/offline-banner', /offline|آف لائن|انٹرنیٹ/i.test(off) ? 'PASS' : 'FAIL', off.replace(/\n+/g, ' | ').slice(0, 200));
  await shot(page, 'm-11-offline-ur');
  await ctx.setOffline(false);
  await page.getByRole('button', { name: 'English' }).click();
  await page.route('**/api/pesticide-checks', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"down"}}' }));
  await upload(page, 'verified'); await page.waitForTimeout(4000);
  const downText = await page.locator('main').innerText();
  rec('m/backend-down-message', /not available right now|Something went wrong|try again/i.test(downText) ? 'PASS' : 'FAIL', downText.replace(/\n+/g, ' | ').slice(0, 300));
  await shot(page, 'm-12-backend-down-en', true);
  await ctx.close();
  fs.writeFileSync(`${S}/dawai2-out.json`, JSON.stringify(results, null, 1));
  const d = await browser.newContext({ ...desktop, storageState: STATE }); const dp = await d.newPage();
  await dp.goto(B + '/dawai-check'); await dp.getByRole('button', { name: 'اردو' }).click(); await shot(dp, 'd-00-landing-ur', true);
  await upload(dp, 'verified');
  await dp.locator('#dc-verdict-title').waitFor({ timeout: 60000 }).then(async () => { rec('d/urdu-result', 'PASS', await dp.locator('#dc-verdict-title').innerText()); await shot(dp, 'd-03-result-verified-ur', true); }, () => rec('d/urdu-result', 'FAIL'));
  await browser.close();
  fs.writeFileSync(`${S}/dawai2-out.json`, JSON.stringify(results, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
