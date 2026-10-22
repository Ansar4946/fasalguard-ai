// Real Chromium -> Next web (3100) -> BFF -> API. Run: node docs/qa/satellite-sample/verify.cjs
// Screenshots named sample-*.png are the LIVE app (demo account, CLOUD_BLOCKED scans -> sample preview).
// Screenshots named MOCKED-*.png use page.route() responses to prove a real COMPLETED capture shows no sample label.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const WEB = 'http://localhost:3100';
const OUT = __dirname;
const results = [];
const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

async function login(browser) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(WEB + '/login');
  await p.fill('input[name=identifier]', 'demo.farmer@example.com');
  await p.fill('input[name=password]', process.env.QA_PASSWORD);
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 30000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function selectField(page) {
  // pick the demo field 'rangeel pur field' if the farm list defaults elsewhere
  const farm = page.locator('select').nth(0);
  const opts = await farm.locator('option').allInnerTexts();
  const idx = opts.findIndex((o) => /golden rice/i.test(o));
  if (idx >= 0) await farm.selectOption({ index: idx });
  await page.waitForTimeout(800);
  const field = page.locator('select').nth(1);
  const fo = await field.locator('option').allInnerTexts();
  const fi = fo.findIndex((o) => /rangeel/i.test(o));
  if (fi >= 0) await field.selectOption({ index: fi });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const state = await login(browser);
  for (const [label, vp] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport: vp, storageState: state });
    const page = await ctx.newPage();
    const storageWrites = [];
    await page.addInitScript(() => {
      const w = (k) => { window.__sw = (window.__sw || []).concat(k); };
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { w(k); return orig.call(this, k, v); };
    });
    const apiSeen = [];
    page.on('request', (r) => { if (r.method() !== 'GET' && /satellite/.test(r.url())) apiSeen.push(r.method() + ' ' + r.url()); });
    await page.goto(WEB + '/satellite', { waitUntil: 'domcontentloaded' });
    await page.getByRole('status').filter({ hasText: 'SAMPLE DATA' }).waitFor({ timeout: 30000 }).catch(() => {});
    await selectField(page);
    const banner = page.getByRole('status').filter({ hasText: 'SAMPLE DATA - illustrative only' });
    await banner.waitFor({ timeout: 30000 });
    const btext = (await banner.innerText()).replace(/\s+/g, ' ');
    rec(`${label}: banner present with reason`, /not measurements of your field/.test(btext) && /Real satellite data is unavailable right now: /.test(btext), btext.slice(0, 200));
    rec(`${label}: Request a new real scan button`, await banner.getByRole('button', { name: 'Request a new real scan' }).isVisible());
    rec(`${label}: map watermark badge`, await page.getByText('Sample - not real').isVisible());
    const body = await page.locator('body').innerText();
    rec(`${label}: metric cards say sample`, /Area \(sample\)/i.test(body) && /Cloud \(sample\)/i.test(body));
    rec(`${label}: AI interpretation + next steps disabled`, (body.match(/Not available for sample data/g) || []).length >= 2);
    rec(`${label}: no real action links in sample mode`, (await page.locator('.page-container a[href="/tasks"], .page-container a[href="/consultations"]').count()) === 0);
    rec(`${label}: old failure text not shown`, !/This scan failed|Data quality\s*UNKNOWN/i.test(body));
    // no horizontal scroll
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    rec(`${label}: no horizontal page scroll`, overflow <= 0, `overflow ${overflow}px`);
    await page.locator('.leaflet-container').waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const polys = await page.locator('.leaflet-overlay-pane path').count();
    rec(`${label}: map renders field + sample zones`, polys >= 2, `${polys} svg paths`);
    await page.screenshot({ path: path.join(OUT, `sample-${label}-top.png`) });
    await banner.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `sample-${label}-full.png`), fullPage: true });
    await page.getByRole('button', { name: 'Vegetation', exact: true }).click();
    await page.waitForTimeout(800);
    const vtext = await page.locator('body').innerText();
    rec(`${label}: vegetation chips labelled sample`, /NDVI mean \(sample\)/i.test(vtext));
    await page.getByRole('button', { name: 'Change detection', exact: true }).click();
    await page.waitForTimeout(500);
    rec(`${label}: change detection labelled sample`, /Sample point 1/.test(await page.locator('body').innerText()));
    await page.screenshot({ path: path.join(OUT, `sample-${label}-change.png`) });
    const sw = await page.evaluate(() => window.__sw || []);
    const ls = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    rec(`${label}: no storage writes / sample not in storage`, sw.every((k) => !/satell|sample/i.test(k)) && !/sample/i.test(ls), `(pre-existing unrelated key allowed: onboarding) writes=${JSON.stringify(sw)}`);
    rec(`${label}: no satellite mutation requests made by viewing`, apiSeen.length === 0, apiSeen.join(','));
    await ctx.close();
  }

  // MOCKED real COMPLETED capture: no sample label anywhere.
  for (const [tag, days] of [['fresh', 3], ['stale', 40]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
    const page = await ctx.newPage();
    const acq = new Date(Date.now() - days * 86400000).toISOString();
    const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/fields/*/satellite-scans', (route) => route.request().method() === 'GET'
      ? route.fulfill(json([{ id: 'mock-scan-1', fieldId: 'x', processingStatus: 'COMPLETED', acquisitionDate: acq, cloudCoverage: 4, usablePixelPercentage: 93, dataQuality: 'GOOD', createdAt: acq }]))
      : route.continue());
    await page.route('**/api/satellite-scans/mock-scan-1/layers', (r) => r.fulfill(json([])));
    await page.route('**/api/satellite-scans/mock-scan-1/statistics', (r) => r.fulfill(json([
      { index: 'NDVI', statistics: { mean: 0.61, validPixelPercentage: 93, maskedCloudPercentage: 4, maskedPixelPercentage: 7 } },
      { index: 'EVI', statistics: { mean: 0.44, validPixelPercentage: 93, maskedCloudPercentage: 4 } },
      { index: 'NDWI', statistics: { mean: -0.3, validPixelPercentage: 93, maskedCloudPercentage: 4 } },
      { index: 'NDMI', statistics: { mean: 0.2, validPixelPercentage: 93, maskedCloudPercentage: 4 } }])));
    await page.route('**/api/satellite-scans/mock-scan-1/stress-zones', (r) => r.fulfill(json([])));
    await page.route('**/api/satellite-scans/mock-scan-1/evidence', (r) => r.fulfill(json({ status: 'OK', baselineMethod: 'ROLLING_FIELD_BASELINE', observedAt: acq, evidence: {} })));
    await page.goto(WEB + '/satellite', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Recommended next steps' }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText();
    rec(`MOCKED ${tag}: no sample label for real COMPLETED capture`, !/sample/i.test(body) && (await page.getByText('Sample - not real').count()) === 0);
    rec(`MOCKED ${tag}: real action links present`, (await page.locator('.page-container a[href="/tasks"]').count()) === 1);
    const stale = await page.getByText('Older real capture.').count();
    rec(`MOCKED ${tag}: older-than notice ${days > 14 ? 'shown' : 'absent'}`, days > 14 ? stale === 1 && /40 days old/.test(body) : stale === 0);
    await page.screenshot({ path: path.join(OUT, `MOCKED-real-completed-${tag}-1440.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
