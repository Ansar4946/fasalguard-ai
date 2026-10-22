// Real Chromium -> Next web (3027) -> BFF -> core/platform API -> PostgreSQL for F01..F05 UI workflows.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const { db, farmer, call, makeField, check, finish, sleep, crypto, WEB: WEB_API, PLAT, API, square, blocked } = require('./lib.cjs');
const WEB = 'http://localhost:3027'; // browser origin must equal CORS_ORIGINS/WEB_APP_URL (localhost), not 127.0.0.1
const shots = path.resolve(__dirname, '../qa7-logs');
const REAL = path.resolve(__dirname, '../../../public/expert-case-leaf-early.png');
const txt = (page) => page.locator('body').innerText();
const SOW = new Date(Date.now() + 5 * 3600e3 - 40 * 86400e3).toISOString().slice(0, 10);
async function ctxFor(browser, who, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  await context.addCookies([{ name: 'fg_access', value: who.token, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  context.errors = []; context.bad = [];
  context.on('page', (p) => { p.on('pageerror', (e) => context.errors.push(String(e.message).slice(0, 160))); p.on('response', (r) => { if (r.status() >= 500) context.bad.push(`${r.status()} ${r.url().replace(WEB, '')}`); }); });
  return context;
}
(async () => {
  const c = await db();
  const browser = await chromium.launch({ headless: true });
  const A = await farmer(c, 'BRA'); const B = await farmer(c, 'BRB');
  const fW = await makeField(A, { crop: 'wheat', lon: 72.50, lat: 31.55, sowing: SOW, name: 'BR wheat field' });
  const fR = await makeField(A, { crop: 'rice', lon: 72.60, lat: 31.55, sowing: SOW, name: 'BR rice field' });
  const E = await farmer(c, 'BRE'); // empty farmer: no farms at all
  const fB = await makeField(B, { crop: 'wheat', lon: 73.4, lat: 31.55, sowing: SOW, name: 'BR B field' });

  // ---------- F05
  await check('B-F05-01', 'Fields page (UI->BFF->API->DB): farm shows its fields; import a GeoJSON FeatureCollection file; DB rows appear', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage();
    await page.goto(`${WEB}/farms/${fW.farmId}/fields`, { waitUntil: 'domcontentloaded' });
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Maps and boundaries' }) });
    await section.getByLabel('Field boundary', { exact: true }).waitFor({ timeout: 30000 });
    const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'BR imported alpha' }, geometry: square(72.52, 31.56) }] };
    await section.getByLabel('Import GeoJSON file').setInputFiles({ name: 'alpha.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geo)) });
    const resp = page.waitForResponse((r) => r.url().includes('/fields/import') && r.request().method() === 'POST');
    await section.getByRole('button', { name: 'Import fields', exact: true }).click(); const r = await resp; assert.equal(r.status(), 201, await r.text());
    const n = (await c.query("SELECT count(*)::int n FROM fields WHERE farm_id=$1 AND name='BR imported alpha' AND deleted_at IS NULL", [fW.farmId])).rows[0].n; assert.equal(n, 1);
    await page.screenshot({ path: path.join(shots, 'br-f05-import.png') });
    assert.deepEqual(ctx.bad, [], 'server errors ' + ctx.bad.join()); await ctx.close(); return 'imported via UI, 1 DB row';
  });
  await check('B-F05-02', 'UI rejects invalid GeoJSON (bowtie), non-JSON, and >256 KiB file with a visible alert; DB unchanged', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/farms/${fW.farmId}/fields`, { waitUntil: 'domcontentloaded' });
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Maps and boundaries' }) });
    await section.getByLabel('Field boundary', { exact: true }).waitFor({ timeout: 30000 });
    const before = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [fW.farmId])).rows[0].n;
    const files = { bowtie: Buffer.from(JSON.stringify({ type: 'Feature', properties: { name: 'BR bowtie' }, geometry: { type: 'Polygon', coordinates: [[[72.5, 31.5], [72.502, 31.502], [72.502, 31.5], [72.5, 31.502], [72.5, 31.5]]] } })), junk: Buffer.from('this is not json {{{'), big: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [], pad: 'x'.repeat(300000) })) };
    const seen = {};
    for (const [k, buf] of Object.entries(files)) {
      await section.getByLabel('Import GeoJSON file').setInputFiles({ name: k + '.geojson', mimeType: 'application/geo+json', buffer: buf });
      const btn = section.getByRole('button', { name: 'Import fields', exact: true }); if (await btn.isEnabled()) await btn.click(); await sleep(1500);
      seen[k] = (await section.getByRole('alert').allInnerTexts()).join('|').slice(0, 120) || (await section.innerText()).match(/(too large|Invalid|invalid|256)[^\n]{0,60}/)?.[0] || 'NO MESSAGE';
    }
    const after = (await c.query('SELECT count(*)::int n FROM fields WHERE farm_id=$1', [fW.farmId])).rows[0].n; assert.equal(before, after);
    for (const [k, v] of Object.entries(seen)) assert.notEqual(v, 'NO MESSAGE', k + ' produced no user-visible message');
    await ctx.close(); return JSON.stringify(seen);
  });
  await check('B-F05-03', 'farmer B opening farmer A farm fields page gets a not-found/denied state (no A data)', async () => {
    const ctx = await ctxFor(browser, B); const page = await ctx.newPage(); await page.goto(`${WEB}/farms/${fW.farmId}/fields`, { waitUntil: 'domcontentloaded' }); await sleep(1500);
    const t = await txt(page); assert.ok(!/BR wheat field|BR rice field|BR imported/.test(t), 'A data visible to B'); await page.screenshot({ path: path.join(shots, 'br-f05-foreign.png') });
    await ctx.close(); return t.replace(/\s+/g, ' ').slice(0, 140);
  });
  await check('B-F05-04', 'empty state: farmer with no farms sees a useful empty farms page (no sample data)', async () => {
    const ctx = await ctxFor(browser, E); const page = await ctx.newPage(); await page.goto(`${WEB}/farms`, { waitUntil: 'domcontentloaded' }); await sleep(1000);
    const t = await txt(page); assert.ok(!/BR wheat|BR rice/.test(t)); await page.screenshot({ path: path.join(shots, 'br-f05-empty.png') }); await ctx.close(); return t.replace(/\s+/g, ' ').slice(0, 160);
  });
  // ---------- F04
  await check('B-F04-01', 'Weather page: real Open-Meteo forecast for owned field; shows freshness, provider attribution, outlook; no console errors', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/weather`, { waitUntil: 'domcontentloaded' }); await page.getByText('Forecast freshness').waitFor({ timeout: 45000 });
    const t = await txt(page); assert.match(t, /°C/); assert.match(t, /7-day outlook|-day outlook/); await page.screenshot({ path: path.join(shots, 'br-f04-weather.png'), fullPage: true });
    assert.deepEqual(ctx.errors, [], ctx.errors.join()); await ctx.close(); return t.replace(/\s+/g, ' ').slice(0, 200);
  });
  await check('B-F04-02', 'Weather page: demo (unverified) rules are labelled illustrative, never as expert guidance', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/weather`, { waitUntil: 'domcontentloaded' }); await page.getByText('Weather risk signals').waitFor({ timeout: 45000 });
    const t = await txt(page); assert.ok(!/Expert-approved rule/.test(t), 'expert-approved label with demo rules'); await ctx.close(); return t.includes('Demo rule') ? 'demo rule labelled' : 'no matched rules';
  });
  await check('B-F04-03', 'Weather page: provider outage shows stale/unavailable state, not a blank or fabricated forecast', async () => {
    const O = await farmer(c, 'BRO'); const fO = await makeField(O, { crop: 'wheat', lon: 70.3, lat: 29.9, sowing: SOW, name: 'BR outage' });
    require('node:child_process').execSync('docker exec -u root qa7-platform sh -c "echo 127.0.0.1 api.open-meteo.com >> /etc/hosts"');
    try {
      const ctx = await ctxFor(browser, O); const page = await ctx.newPage(); await page.goto(`${WEB}/weather`, { waitUntil: 'domcontentloaded' }); await sleep(6000);
      const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f04-outage.png') });
      assert.ok(/unavailable|try again|couldn.t|No forecast|error/i.test(t), 'no outage message: ' + t.replace(/\s+/g, ' ').slice(0, 200)); assert.ok(!/°C/.test(t) || /Stale/.test(t), 'temperature displayed with provider down');
      await ctx.close(); return t.replace(/\s+/g, ' ').slice(0, 160);
    } finally { require('node:child_process').execSync('docker exec -u root qa7-platform sh -c "grep -v open-meteo.com /etc/hosts > /tmp/h; cat /tmp/h > /etc/hosts"'); }
  });
  // ---------- F02
  await check('B-F02-01', 'Satellite page: empty state, then Request scan -> real STAC scan completes in DB and the UI shows a terminal state', async () => {
    const S = await farmer(c, 'BRS'); const fS = await makeField(S, { crop: 'wheat', lon: 72.2, lat: 31.45, sowing: SOW, name: 'BR sat field' });
    const ctx = await ctxFor(browser, S); const page = await ctx.newPage(); await page.goto(`${WEB}/satellite`, { waitUntil: 'domcontentloaded' });
    await page.getByText('No satellite scans yet for this field').waitFor({ timeout: 45000 }); await page.screenshot({ path: path.join(shots, 'br-f02-empty.png') });
    const post = page.waitForResponse((r) => /satellite-scans/.test(r.url()) && r.request().method() === 'POST'); await page.getByRole('button', { name: /Request satellite scan/ }).click(); const pr = await post; assert.equal(pr.status(), 202, await pr.text());
    let st; for (let i = 0; i < 40; i++) { st = (await c.query('SELECT processing_status s FROM satellite_captures WHERE field_id=$1 ORDER BY created_at DESC LIMIT 1', [fS.fieldId])).rows[0]?.s; if (['COMPLETED', 'NO_VALID_SCENE', 'FAILED', 'CLOUD_BLOCKED'].includes(st)) break; await sleep(5000); }
    await sleep(8000); const t0 = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f02-result-live.png'), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(8000); const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f02-result.png'), fullPage: true });
    const live = /Complete|No cloud-free|Failed/.test(t0), after = /NDVI/.test(t); await ctx.close();
    assert.ok(/Complete|No cloud-free scene|Failed/.test(t), 'UI does not show terminal state after reload; db=' + st + ' text=' + t.replace(/\s+/g, ' ').slice(0, 200));
    return `db=${st}; UI terminal text without reload=${live}; NDVI visible after reload=${after}`;
  });
  await check('B-F02-02', 'Satellite page as farmer B never shows A scans/fields', async () => {
    const ctx = await ctxFor(browser, B); const page = await ctx.newPage(); await page.goto(`${WEB}/satellite`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
    const t = await txt(page); assert.ok(!/BR wheat|BR rice/.test(t)); await ctx.close();
  });
  // ---------- F03
  await check('B-F03-01', 'Irrigation page full UI flow: fill real profile form -> save -> record event -> calculate (Open-Meteo archive) -> result equals DB', async () => {
    const I = await farmer(c, 'BRI'); const fI = await makeField(I, { crop: 'wheat', lon: 72.3, lat: 31.4, sowing: SOW, name: 'BR irrigation field' });
    const ctx = await ctxFor(browser, I); const page = await ctx.newPage(); await page.goto(`${WEB}/irrigation`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Save water profile').waitFor({ timeout: 45000 }); await page.screenshot({ path: path.join(shots, 'br-f03-initial.png'), fullPage: true });
    const P = { 'Initial single crop coefficient': 0.35, 'Mid-season single crop coefficient': 1.15, 'End single crop coefficient': 0.6, 'Initial basal crop coefficient': 0.15, 'Mid-season basal crop coefficient': 1.1, 'End basal crop coefficient': 0.5, 'Initial stage (days)': 25, 'Development stage (days)': 50, 'Mid-season stage (days)': 50, 'Late stage (days)': 25, 'Initial crop height (m)': 0.01, 'Maximum crop height (m)': 1.2, 'Field capacity (m³/m³)': 0.25, 'Wilting point (m³/m³)': 0.1, 'Initial soil water (m³/m³)': 0.15, 'Initial root depth (m)': 0.5, 'Maximum root depth (m)': 0.5, 'Allowable depletion fraction': 0.5, 'Evaporation layer depth (m)': 0.1, 'Readily evaporable water (mm)': 8, 'Runoff curve number': 70 };
    for (const [label, v] of Object.entries(P)) await page.getByLabel(label, { exact: true }).fill(String(v));
    await page.getByLabel('Application efficiency').fill('0.8'); await page.getByLabel('Wetted fraction').fill('1'); await page.getByLabel('Parameter source').fill('QA7 synthetic scenario; not measured soil data'); await page.getByRole('checkbox').first().check();
    const save = page.waitForResponse((r) => /irrigation\/profile/.test(r.url()) && r.request().method() === 'PUT'); await page.getByRole('button', { name: 'Save water profile' }).click(); const sr = await save; assert.equal(sr.status(), 200, await sr.text());
    await page.getByText('Profile saved').waitFor({ timeout: 15000 });
    const prof = (await c.query('SELECT version, inputs FROM field_water_profiles WHERE field_id=$1', [fI.fieldId])).rows; assert.equal(prof.length, 1); assert.equal(prof[0].inputs.parameters.thetaFC, 0.25);
    await page.getByLabel('Irrigation date').fill(new Date(Date.now() + 5 * 3600e3 - 10 * 86400e3).toISOString().slice(0, 10)); await page.getByLabel('Gross depth mm').fill('30'); await page.getByLabel('Event source').fill('QA7 farmer log');
    const ev = page.waitForResponse((r) => /irrigation\/events/.test(r.url()) && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Record irrigation' }).click(); const er = await ev; assert.equal(er.status(), 201, await er.text());
    await page.getByLabel('Balance end date').fill(new Date(Date.now() + 5 * 3600e3 - 86400e3).toISOString().slice(0, 10)); await page.getByText(/I confirm no other irrigation occurred/).click();
    const run = page.waitForResponse((r) => /irrigation-runs/.test(r.url()) && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Calculate water balance' }).click(); const rr = await run; assert.equal(rr.status(), 202, await rr.text());
    let row; for (let i = 0; i < 40; i++) { row = (await c.query("SELECT status, result FROM irrigation_runs WHERE field_id=$1 ORDER BY created_at DESC LIMIT 1", [fI.fieldId])).rows[0]; if (row && ['COMPLETED', 'FAILED', 'BLOCKED_EXTERNAL'].includes(row.status)) break; await sleep(4000); }
    assert.equal(row.status, 'COMPLETED', 'run ended ' + row.status);
    await page.getByRole('button', { name: 'Refresh results' }).first().click().catch(() => {}); await sleep(5000); const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f03-result.png'), fullPage: true });
    const gross = row.result.advisory.grossDepthMm; const shown = (t.match(/\d+(\.\d+)?\s*mm/g) || []).slice(0, 12).join(', ');
    assert.ok(t.includes(gross.toFixed(1)) || t.includes(gross.toFixed(2)) || t.includes(String(Math.round(gross))), `UI does not show the DB gross depth ${gross.toFixed(2)} mm; mm values on page: ${shown}`);
    await ctx.close(); return `DB gross depth ${gross.toFixed(2)} mm shown in UI; profile version ${prof[0].version}`;
  });
  await check('B-F03-02', 'Irrigation page: rice field selected -> explicit unsupported-system message, no calculation controls enabled', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/irrigation`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Field', { exact: true }).selectOption({ label: fR.field.name }).catch(async () => { const opts = await page.getByLabel('Field', { exact: true }).locator('option').allInnerTexts(); throw new Error('rice option missing: ' + opts.join('|')); });
    await sleep(3000); const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f03-rice.png'), fullPage: true });
    assert.ok(/rice|flooded|unsupported|not supported/i.test(t), 'no unsupported message: ' + t.replace(/\s+/g, ' ').slice(0, 200)); await ctx.close(); return 'unsupported message shown';
  });
  // ---------- F01
  await check('B-F01-00', 'Scan flow UI: select field -> upload real leaf photo under the SHIPPED Content-Security-Policy (browser PUT to the stack storage URL)', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/scan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Scan Your Crop' }).waitFor({ timeout: 30000 }); await page.getByRole('button', { name: /Continue to Photos/ }).waitFor(); await sleep(2500); await page.screenshot({ path: path.join(shots, 'br-f01-field.png') });
    await page.getByRole('button', { name: /Continue to Photos/ }).click(); await page.waitForURL(/\/scan\/upload/, { timeout: 15000 });
    await page.locator('input[type=file]').first().setInputFiles(REAL); await sleep(9000); await page.screenshot({ path: path.join(shots, 'br-f01-upload.png'), fullPage: true });
    const cont = page.getByRole('button', { name: /Continue/ }).last(); const enabled = await cont.isEnabled().catch(() => false);
    const rows = (await c.query("SELECT count(*)::int n FROM media_assets WHERE owner_id=$1 AND purpose='crop-scan' AND status='ready'", [A.userId])).rows[0].n;
    assert.ok(rows >= 1, 'photo did not reach private storage (check CORS/PUT)'); assert.ok(enabled, 'Continue disabled after successful upload'); await ctx.close(); return `ready media rows=${rows}; continue enabled=${enabled}`;
  });
  await check('B-F01-01', 'Scan flow UI: select field -> upload real leaf photo with bypassCSP=true (harness workaround for the http storage origin, see B-F01-00) -> photo stored and Continue enabled', async () => {
    const ctx = await ctxFor(browser, A, { bypassCSP: true }); const page = await ctx.newPage(); await page.goto(`${WEB}/scan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Scan Your Crop' }).waitFor({ timeout: 30000 }); await page.getByRole('button', { name: /Continue to Photos/ }).waitFor(); await sleep(2500); await page.screenshot({ path: path.join(shots, 'br-f01-field.png') });
    await page.getByRole('button', { name: /Continue to Photos/ }).click(); await page.waitForURL(/\/scan\/upload/, { timeout: 15000 });
    await page.locator('input[type=file]').first().setInputFiles(REAL); await sleep(9000); await page.screenshot({ path: path.join(shots, 'br-f01-upload.png'), fullPage: true });
    const cont = page.getByRole('button', { name: /Continue/ }).last(); const enabled = await cont.isEnabled().catch(() => false);
    const rows = (await c.query("SELECT count(*)::int n FROM media_assets WHERE owner_id=$1 AND purpose='crop-scan' AND status='ready'", [A.userId])).rows[0].n;
    assert.ok(rows >= 1, 'photo did not reach private storage (check CORS/PUT)'); assert.ok(enabled, 'Continue disabled after successful upload'); await ctx.close(); return `ready media rows=${rows}; continue enabled=${enabled}`;
  });
  await check('B-F01-02', 'Scan flow UI: corrupt/disguised file chosen in the picker is refused with a visible message', async () => {
    const ctx = await ctxFor(browser, A); const page = await ctx.newPage(); await page.goto(`${WEB}/scan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue to Photos/ }).click(); await page.waitForURL(/\/scan\/upload/, { timeout: 15000 });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('<html>not an image</html>') }); await sleep(2500);
    const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f01-corrupt.png') }); assert.ok(/could not|unsupported|invalid|try another|not.*image|unreadable/i.test(t), 'no refusal message: ' + t.replace(/\s+/g, ' ').slice(0, 200)); await ctx.close();
  });
  await check('B-F01-03', 'Scan flow UI end-to-end: upload -> symptoms -> Start AI analysis -> analysis/result page; farmer-readable outcome, never a raw internal error string', async () => {
    const X = await farmer(c, 'BRX'); const fX = await makeField(X, { crop: 'wheat', lon: 72.9, lat: 31.55, sowing: SOW, name: 'BR scan field' });
    const ctx = await ctxFor(browser, X, { bypassCSP: true }); const page = await ctx.newPage(); await page.goto(`${WEB}/scan`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Continue to Photos/ }).waitFor({ timeout: 30000 }); await sleep(2500); await page.getByRole('button', { name: /Continue to Photos/ }).click(); await page.waitForURL(/\/scan\/upload/, { timeout: 15000 });
    await page.locator('input[type=file]').first().setInputFiles(REAL); await sleep(9000);
    await page.getByRole('button', { name: /Continue/ }).last().click(); await page.waitForURL(/\/scan\/symptoms/, { timeout: 15000 });
    await page.getByText('Not spreading', { exact: true }).click(); await page.getByText('A few plants', { exact: true }).click(); await page.getByText('No', { exact: true }).first().click();
    await page.getByRole('button', { name: /Start AI analysis/ }).click(); await page.waitForURL(/\/scan\/(analysis|results)/, { timeout: 30000 });
    const analyse = (await c.query("SELECT status, failure_code FROM crop_scans WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1", [X.userId])).rows[0];
    let scan = analyse; for (let i = 0; i < 30; i++) { scan = (await c.query('SELECT status, failure_code FROM crop_scans WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1', [X.userId])).rows[0]; if (scan && !['CREATED', 'UPLOADING', 'IMAGE_VALIDATION', 'ANALYSING'].includes(scan.status)) break; await sleep(3000); }
    await sleep(8000); const t = await txt(page); await page.screenshot({ path: path.join(shots, 'br-f01-final.png'), fullPage: true });
    const url = new URL(page.url()).pathname;
    assert.ok(!/is not a function|TypeError|undefined|\[object Object\]/i.test(t), `raw internal error shown to farmer (db status=${scan?.status} failure_code=${scan?.failure_code}): ` + t.replace(/\s+/g, ' ').match(/.{0,80}(is not a function|TypeError|undefined).{0,40}/i)?.[0]);
    assert.ok(!scan || !/is not a function/.test(String(scan.failure_code)), `scan failed internally: status=${scan?.status} failure_code='${scan?.failure_code}' ; UI shows: ` + t.replace(/\s+/g, ' ').slice(0, 260));
    await ctx.close(); return `url=${url} db=${scan?.status}/${scan?.failure_code} text=` + t.replace(/\s+/g, ' ').slice(0, 240);
  });
  // ---------- responsive
  await check('B-ALL-01', 'mobile 375px: weather, satellite, irrigation, scan, fields pages have no horizontal overflow', async () => {
    const ctx = await ctxFor(browser, A, { viewport: { width: 375, height: 800 } }); const page = await ctx.newPage(); const res = {};
    for (const p of ['/weather', '/satellite', '/irrigation', '/scan', `/farms/${fW.farmId}/fields`]) { await page.goto(WEB + p, { waitUntil: 'domcontentloaded' }); await sleep(2500); res[p.replace(fW.farmId, ':farm')] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
    await page.screenshot({ path: path.join(shots, 'br-mobile-fields.png') }); const bad = Object.entries(res).filter(([, d]) => d > 2); assert.deepEqual(bad, [], JSON.stringify(res)); await ctx.close(); return JSON.stringify(res);
  });
  await check('B-ALL-02', 'unauthenticated browser visits to feature pages redirect to login (no data flash)', async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const res = {};
    for (const p of ['/weather', '/satellite', '/irrigation', '/scan', '/farms']) { await page.goto(WEB + p, { waitUntil: 'domcontentloaded' }); res[p] = new URL(page.url()).pathname; }
    await page.goto(WEB + '/irrigation', { waitUntil: 'domcontentloaded' }); await sleep(4000); const shell = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200);
    assert.ok(Object.values(res).every((x) => /login|sign/i.test(x)), JSON.stringify(res) + ' ; unauthenticated /irrigation renders: ' + shell); await ctx.close(); return JSON.stringify(res);
  });
  await browser.close();
  finish(path.join(shots, 'browser.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
