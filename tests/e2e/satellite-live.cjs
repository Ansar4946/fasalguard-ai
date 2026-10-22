// Explicit public-imagery E2E; synthetic identities must be created in f02_test only.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const fixture = JSON.parse(fs.readFileSync('/source/services/platform-api/f02-browser-fixture.json', 'utf8'));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL: 'http://0.0.0.0:3000', viewport: { width: 1440, height: 1080 } });
  await context.addCookies([{ name: 'fg_access', value: fixture.token, domain: '0.0.0.0', path: '/', httpOnly: true }]);
  const page = await context.newPage();
  try {
    const legacy = await context.request.get(`/api/satellite-scans/${fixture.legacyCapture}/layers`);
    assert.equal(legacy.status(), 200); // FastAPI409 -> existing core200 fallback
    assert.deepEqual(await legacy.json(), []);
    await page.goto('/satellite');
    await page.getByRole('button', { name: 'Request satellite scan', exact: true }).waitFor({ timeout: 30000 });
    await page.getByLabel('Satellite date from').fill('2025-01-01');
    await page.getByLabel('Satellite date to').fill('2025-02-20');
    const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/satellite-scans'));
    await page.getByRole('button', { name: 'Request satellite scan', exact: true }).click();
    const response = await created;
    assert.equal(response.status(), 202);
    const capture = await response.json();
    let final;
    for (let attempt = 0; attempt < 150; attempt++) {
      const result = await context.request.get(`/api/satellite-scans/${capture.id}`);
      assert.equal(result.status(), 200);
      final = await result.json();
      if (['COMPLETED', 'FAILED', 'CLOUD_BLOCKED', 'NO_VALID_SCENE'].includes(final.processingStatus)) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    assert.equal(final.processingStatus, 'COMPLETED', JSON.stringify(final));
    const stats = await (await context.request.get(`/api/satellite-scans/${capture.id}/statistics`)).json();
    assert.deepEqual(stats.map(entry => entry.index).sort(), ['EVI', 'NDMI', 'NDVI', 'NDWI']);
    assert(stats.every(entry => Number.isFinite(entry.statistics.mean)));
    await page.reload();
    await page.getByRole('button', { name: 'Vegetation', exact: true }).click();
    await page.getByLabel('Satellite index').selectOption('EVI');
    const preview = page.getByAltText('EVI field index; transparent pixels are masked');
    await preview.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => [...document.images].some(img => img.alt.startsWith('EVI field') && img.complete && img.naturalWidth > 0));
    const layers = await (await context.request.get(`/api/satellite-scans/${capture.id}/layers`)).json();
    assert.equal(layers.length, 9);
    const image = await context.request.get(layers.find(layer => layer.type === 'EVI_PREVIEW').access.url);
    assert.equal(image.status(), 200);
    assert.equal(image.headers()['cache-control'], 'private, no-store');
    await page.screenshot({ path: '/source/docs/features/f02-results/browser-evi.png', fullPage: true });
    const secondResponse = await context.request.post(`/api/fields/${fixture.field}/satellite-scans`, { headers: { origin: 'http://0.0.0.0:3000' }, data: { from: '2026-09-13T00:00:00Z', to: '2026-10-12T23:59:59Z', maxCloudCoverage: 30 } });
    assert.equal(secondResponse.status(), 202);
    const second = await secondResponse.json();
    let secondFinal;
    for (let attempt = 0; attempt < 150; attempt++) {
      secondFinal = await (await context.request.get(`/api/satellite-scans/${second.id}`)).json();
      if (['COMPLETED', 'FAILED', 'CLOUD_BLOCKED', 'NO_VALID_SCENE'].includes(secondFinal.processingStatus)) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    assert.equal(secondFinal.processingStatus, 'COMPLETED');
    const comparison = await (await context.request.get(`/api/fields/${fixture.field}/satellite-comparison`)).json();
    assert.equal(comparison.comparisonBasis, 'PREVIOUS_VALID_OBSERVATION');
    assert(comparison.observations.length >= 2);
    assert.notEqual(final.acquisitionDate, secondFinal.acquisitionDate);
    await context.clearCookies();
    await context.addCookies([{ name: 'fg_access', value: fixture.otherToken, domain: '0.0.0.0', path: '/' }]);
    assert.equal((await context.request.get(`/api/satellite-scans/${capture.id}`)).status(), 404);
    assert.equal((await context.request.get(layers.find(layer => layer.type === 'EVI_PREVIEW').access.url)).status(), 404);
    const evidence = { status: 'PASS', captureId: capture.id, acquisitionDate: final.acquisitionDate, provider: final.provider, statistics: stats, privateLayers: layers.length, comparison, legacyLayerFallback: true, otherUserCaptureAndMediaDenied: true };
    fs.writeFileSync('/source/docs/features/f02-results/browser-live.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } catch (error) {
    await page.screenshot({ path: '/source/docs/features/f02-results/browser-failure.png', fullPage: true });
    console.error('Browser failure URL:', page.url(), 'Visible text:', (await page.locator('body').innerText()).slice(0, 3000));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
