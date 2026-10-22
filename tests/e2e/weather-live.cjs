// Real provider workflow on synthetic test identities. Never print the private fixture.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.F04_FIXTURE || '/tmp/f04-browser-fixture.json', 'utf8'));
  const baseURL = process.env.F04_BASE_URL || 'http://fasalguard-f04-web:3000';
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1080 }, timezoneId: 'America/New_York' });
  const domain = new URL(baseURL).hostname;
  await context.addCookies([{ name: 'fg_access', value: fixture.token, domain, path: '/', httpOnly: true }]);
  const page = await context.newPage();
  try {
    const resultPromise = page.waitForResponse(r => r.url().includes(`/fields/${fixture.field}/weather/forecast`));
    await page.goto('/weather');
    const response = await resultPromise;
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.equal(data.provider, 'OPEN_METEO');
    assert.equal(data.freshness, 'FRESH');
    assert.equal(data.hourly.length, 168);
    assert.equal(data.daily.length, 7);
    assert.equal(data.providerIssuedAt, null);
    assert.equal(data.rawMetadata.dataKind, 'MODEL_FORECAST');
    await page.getByText('Forecast freshness', { exact: true }).waitFor({ timeout: 30000 });
    await page.getByText('7-day outlook', { exact: true }).waitFor();
    await page.getByText('Hourly forecast (60-minute intervals)', { exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 168);
    await page.screenshot({ path: '/tmp/f04-browser-live.png', fullPage: true });

    // Simulated provider/BFF outage: explicitly separate from genuine provider evidence.
    await page.route('**/api/fields/*/weather/forecast', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Simulated provider outage for E2E validation.' } }) }));
    await page.getByRole('button', { name: 'Refresh forecast', exact: true }).click();
    await page.getByText('Simulated provider outage for E2E validation.', { exact: true }).waitFor();
    await page.unroute('**/api/fields/*/weather/forecast');
    await page.getByRole('button', { name: /Try again|Retry/i }).click();
    await page.getByText('Forecast freshness', { exact: true }).waitFor();

    // Synthetic UI-only expiry fixture; genuine provider screenshot/evidence was captured above.
    let refreshes = 0;
    let releaseRefresh;
    const hold = new Promise(resolve => { releaseRefresh = resolve; });
    await page.route('**/api/fields/*/weather/risks', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      fieldId: fixture.field, crop: 'Synthetic test crop', provider: 'OPEN_METEO', assessment: 'HARMFUL', productionAssessment: 'HARMFUL',
      matches: [{ id: 'synthetic-rule', category: 'HEAT_STRESS', suitability: 'HARMFUL', priority: 1, message: 'Synthetic expiry test warning; not farming guidance.', source: 'E2E fixture only', validationStatus: 'EXPERT_APPROVED', isExpertApproved: true, recommendationAllowed: true }],
      recommendationAllowed: true, disclaimer: 'Synthetic browser fixture only.', ruleProvenance: { hasExpertApprovedRules: true, demoRuleCount: 0 }
    }) }));
    await page.route('**/api/fields/*/weather/forecast', async route => {
      if (refreshes++ === 0) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...data, expiresAt: new Date(Date.now() + 2500).toISOString() }) });
      await hold;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Synthetic expiry-refresh outage.' } }) });
    });
    await page.getByRole('button', { name: 'Refresh forecast', exact: true }).click();
    const hero = page.locator('article').filter({ hasText: 'Crop-weather suitability' }).first();
    await hero.getByText('Synthetic expiry test warning; not farming guidance.', { exact: true }).waitFor();
    await page.getByText(/^Stale forecast/).waitFor({ timeout: 10000 });
    assert.equal(await hero.getByText('Synthetic expiry test warning; not farming guidance.', { exact: true }).count(), 0);
    await page.getByText('Forecast expired — guidance unavailable', { exact: true }).waitFor();
    releaseRefresh();
    await page.getByText('Synthetic expiry-refresh outage.', { exact: true }).waitFor();
    await page.unroute('**/api/fields/*/weather/forecast');
    await page.unroute('**/api/fields/*/weather/risks');

    assert.equal((await context.request.get('/api/fields/not-a-uuid/weather/forecast')).status(), 400);
    await context.clearCookies();
    await context.addCookies([{ name: 'fg_access', value: fixture.otherToken, domain, path: '/' }]);
    assert.equal((await context.request.get(`/api/fields/${fixture.field}/weather/forecast`)).status(), 404);
    await context.clearCookies();
    assert.equal((await context.request.get(`/api/fields/${fixture.field}/weather/forecast`)).status(), 401);
    const evidence = { status: 'RUN_PASS', fieldId: fixture.field, provider: data.provider, fetchedAt: data.fetchedAt, expiresAt: data.expiresAt,
      providerIssuedAt: data.providerIssuedAt, freshness: data.freshness, timezone: data.timezone, browserTimezone: 'America/New_York',
      hourlyPoints: data.hourly.length, daily: data.daily, rawMetadata: data.rawMetadata,
      simulatedOutageAndRecovery: true, syntheticExpirySuppressedGuidance: true, nonOwnerDenied: true, anonymousDenied: true, invalidUuidRejected: true };
    fs.writeFileSync('/tmp/f04-browser-live.json', JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } catch (error) {
    await page.screenshot({ path: '/tmp/f04-browser-failure.png', fullPage: true });
    console.error('F04 browser failed:', error.message, 'URL:', page.url());
    console.error((await page.locator('body').innerText()).slice(0, 2500));
    throw error;
  } finally { await browser.close(); }
})().catch(() => process.exit(1));
