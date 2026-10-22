// Follow-up UI assertion against the completed real satellite-live.cjs fixtures.
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const fixture = JSON.parse(fs.readFileSync('/source/services/platform-api/f02-browser-fixture.json', 'utf8'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ baseURL: 'http://0.0.0.0:3000', viewport: { width: 1440, height: 1080 } });
    await context.addCookies([{ name: 'fg_access', value: fixture.token, domain: '0.0.0.0', path: '/' }]);
    const page = await context.newPage();
    await page.goto('/satellite');
    await page.getByRole('button', { name: 'Change detection', exact: true }).click({ timeout: 30000 });
    await page.getByText('PREVIOUS VALID OBSERVATION', { exact: true }).waitFor({ timeout: 30000 });
    await page.getByText('EVI 0.57', { exact: true }).waitFor();
    await page.getByText('EVI 0.35', { exact: true }).waitFor();
    await page.screenshot({ path: '/source/docs/features/f02-results/browser-trend.png', fullPage: true });
    const path = '/source/docs/features/f02-results/browser-live.json';
    const evidence = JSON.parse(fs.readFileSync(path, 'utf8'));
    evidence.trendUiVerified = true;
    fs.writeFileSync(path, JSON.stringify(evidence, null, 2));
    console.log('PASS: two real acquisition dates and EVI observations rendered in Change detection.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
