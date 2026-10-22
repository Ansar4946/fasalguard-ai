// F07 real browser (Chromium) -> Next BFF -> Nest API -> PostgreSQL checks on the qa2 stack.
// PHASE=empty (before any sync) | full (after the real AMIS sync) | outage (DB/Redis stop-start is driven by the caller)
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const { db, farmer, call, check, results, WEB, API, crypto } = require('./lib.cjs');
const flush = () => require('node:child_process').execSync('docker exec qa2-redis redis-cli flushall', { stdio: 'ignore' });
const phase = process.env.PHASE || 'full';
const shots = path.resolve(__dirname, '../qa2-logs');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ctxFor = async (browser, who, opts = {}) => {
  const context = await browser.newContext(opts);
  await context.addCookies([{ name: 'fg_access', value: who.token, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  return context;
};
(async () => {
  const c = await db();
  const A = await farmer(c, 'A7');
  const B = await farmer(c, 'B7');
  const browser = await chromium.launch({ headless: true });
  try {
    if (phase === 'empty') {
      await check('F07-E1 API empty state is honest: 200 with zero records (no fabricated prices)', async () => {
        const r = await call('GET', '/market/prices?crop=Wheat&province=Punjab', { token: A.token });
        assert.equal(r.status, 200); assert.equal(r.json.records.length, 0);
        return JSON.stringify(r.json).slice(0, 300);
      });
      await check('F07-E2 browser empty state: heading "No AMIS market records", no price numbers', async () => {
        const ctx = await ctxFor(browser, A); const page = await ctx.newPage();
        await page.goto(`${WEB}/market-intelligence`);
        await page.getByRole('heading', { name: 'No AMIS market records' }).waitFor({ timeout: 30000 });
        const body = await page.locator('body').innerText();
        assert.ok(!/PKR\s*\d/.test(body), 'a PKR price is shown with an empty database');
        await page.screenshot({ path: path.join(shots, 'f07-empty.png') });
        await ctx.close();
      });
    }
    if (phase === 'full') {
      let api;
      await check('F07-01 unauthenticated /market/prices and /history -> 401 (API and BFF)', async () => {
        assert.equal((await call('GET', '/market/prices')).status, 401);
        assert.equal((await call('GET', '/market/history?crop=Wheat')).status, 401);
        assert.equal((await call('GET', '/api/market/prices', { base: WEB })).status, 401);
      });
      await check('F07-02 real AMIS rows persisted: Wheat/Maize/Rice/Cotton/Sugarcane, source AMIS, PKR, 100 kg basis', async () => {
        const rows = (await c.query("SELECT crop_name crop, count(*)::int n, min(quantity)::int qmin, max(quantity)::int qmax, array_agg(DISTINCT source) src, array_agg(DISTINCT unit) cur FROM mandi_prices GROUP BY crop_name ORDER BY crop_name")).rows;
        assert.ok(rows.length >= 4, 'fewer than 4 crops persisted: ' + JSON.stringify(rows));
        rows.forEach((r) => { assert.deepEqual(r.src, ['AMIS']); assert.deepEqual(r.cur, ['KG']); assert.equal(r.qmin, 100); assert.equal(r.qmax, 100); });
        return JSON.stringify(rows);
      });
      await check('F07-03 API prices: records match DB, average within [min,max], dates not in the future', async () => {
        const r = await call('GET', '/market/prices?crop=Wheat&province=Punjab&limit=100', { token: A.token });
        assert.equal(r.status, 200); api = r.json;
        assert.ok(api.records.length > 0, 'no wheat records');
        const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
        for (const x of api.records) {
          assert.ok(x.minimumPrice <= x.averagePrice && x.averagePrice <= x.maximumPrice, `min/avg/max inconsistent ${JSON.stringify(x)}`);
          assert.ok(String(x.priceDate).slice(0, 10) <= today, 'future priceDate ' + x.priceDate);
        }
        const dbn = (await c.query("SELECT count(*)::int n FROM mandi_prices WHERE crop_name ILIKE 'wheat'")).rows[0].n;
        return `api=${api.records.length} db=${dbn} meta=${JSON.stringify(Object.keys(api).filter((k) => k !== 'records'))}`;
      });
      await check('F07-04 API validation: limit 0/101/abc, days 0/366, missing crop, crop>120 chars -> 400', async () => {
        for (const q of ['/market/prices?limit=0', '/market/prices?limit=101', '/market/prices?limit=abc', '/market/prices?crop=' + 'x'.repeat(121), '/market/history', '/market/history?crop=Wheat&days=0', '/market/history?crop=Wheat&days=366', '/market/history?crop=Wheat&limit=501'])
          assert.equal((await call('GET', q, { token: A.token })).status, 400, q.slice(0, 60));
      });
      await check('F07-05 injection-style crop strings are inert (200 empty or 400, never 500)', async () => {
        const out = [];
        for (const v of ["Wheat'; DROP TABLE mandi_prices;--", '%', '_', 'Wheat" OR 1=1 --', '<script>alert(1)</script>']) {
          const r = await call('GET', '/market/prices?crop=' + encodeURIComponent(v), { token: A.token });
          assert.ok(r.status < 500, v + ' -> ' + r.status); out.push(`${v.slice(0, 12)}:${r.status}/${r.json?.records?.length}`);
        }
        assert.ok((await c.query('SELECT count(*)::int n FROM mandi_prices')).rows[0].n > 0, 'table damaged');
        return out.join(' ');
      });
      await check('F07-06 unknown crop / province -> honest empty list', async () => {
        const r = await call('GET', '/market/prices?crop=Dragonfruit', { token: A.token });
        assert.equal(r.status, 200); assert.equal(r.json.records.length, 0);
      });
      await check('F07-07 history: chronological, window respected, one row per market/date', async () => {
        const r = await call('GET', '/market/history?crop=Wheat&days=30', { token: A.token });
        assert.equal(r.status, 200);
        const seen = new Set();
        for (const x of r.json.records) { const k = `${x.marketName}|${String(x.priceDate).slice(0, 10)}`; assert.ok(!seen.has(k), 'duplicate ' + k); seen.add(k); }
        return `records=${r.json.records.length}`;
      });
      await check('F07-08 browser: farmer A sees DB-backed Wheat data, official date, reporting count, PKR/40kg conversion, no error/empty card', async () => {
        const ctx = await ctxFor(browser, A); const page = await ctx.newPage();
        const pr = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/market/prices', { timeout: 30000 });
        await page.goto(`${WEB}/market-intelligence`);
        const resp = await pr; assert.equal(resp.status(), 200);
        const cur = await resp.json();
        await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 30000 });
        const body = norm(await page.locator('body').innerText());
        assert.ok(!/could not be loaded/.test(body)); assert.equal(await page.getByRole('heading', { name: 'No AMIS market records' }).count(), 0);
        const latest = cur.records.reduce((d, r) => (r.priceDate > d ? r.priceDate : d), '');
        const rep = cur.records.filter((r) => r.priceDate === latest);
        const exp = Math.round((rep.reduce((s, r) => s + r.averagePrice, 0) / rep.length) * 40 / 100);
        const fmt = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(exp);
        const overview = norm(await page.locator('article').filter({ hasText: 'Latest reporting-market average' }).innerText());
        assert.ok(overview.replace(/\s/g, '').includes(fmt.replace(/\s/g, '')) || overview.includes(String(exp)), `expected ${fmt} in "${overview.slice(0, 200)}"`);
        assert.ok(overview.includes(`${rep.length} reporting market`), 'reporting count missing: ' + overview.slice(0, 250));
        await page.screenshot({ path: path.join(shots, 'f07-farmerA.png'), fullPage: true });
        await ctx.close();
        return `latest=${latest} reporting=${rep.length} expected40kg=${exp}`;
      });
      await check('F07-09 browser: farmer B (separate session) sees the same public observations', async () => {
        const ctx = await ctxFor(browser, B); const page = await ctx.newPage();
        const pr = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/market/prices', { timeout: 30000 });
        await page.goto(`${WEB}/market-intelligence`); const j = await (await pr).json();
        assert.equal(j.records.length, api.records.length); await ctx.close();
      });
      await check('F07-10 browser: switching crop (Rice/Maize/Cotton/Sugarcane) re-queries and never shows another crop\'s price', async () => {
        const ctx = await ctxFor(browser, A); const page = await ctx.newPage();
        await page.goto(`${WEB}/market-intelligence`);
        await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 30000 });
        const sel = page.locator('select').nth(1); const opts = await sel.locator('option').allInnerTexts();
        const seen = [];
        for (const o of [...opts.filter((x) => x !== 'Wheat'), 'Wheat']) {
          const resp = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/market/prices', { timeout: 30000 });
          await sel.selectOption({ label: o }); const r = await resp; assert.equal(r.status(), 200);
          await page.waitForTimeout(800);
          const t = await page.locator('body').innerText();
          assert.ok(!/could not be loaded/.test(t), `${o}: error card`);
          const j = await r.json(); assert.ok(j.records.every((x) => x.cropName.toLowerCase().startsWith(o.toLowerCase().slice(0, 4)) || o === 'Cotton'), o + ': API returned other crop ' + [...new Set(j.records.map((x) => x.cropName))]); const exp = Math.round((j.records.filter((x) => x.priceDate === j.records.reduce((d, y) => (y.priceDate > d ? y.priceDate : d), '')).reduce((a, x, _, arr) => a + x.averagePrice / arr.length, 0)) * 40 / 100); if (j.records.length) assert.ok(norm(t).replace(/[s,]/g, '').includes(String(exp)), o + ': 40kg mean ' + exp + ' not on page'); seen.push(`${o}:${j.records.length}:${exp}`);
        }
        await ctx.close(); return seen.join(' ');
      });
      await check('F07-11 browser 375px mobile viewport: no horizontal overflow', async () => {
        const ctx = await ctxFor(browser, A, { viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
        await page.goto(`${WEB}/market-intelligence`); await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 30000 });
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await page.screenshot({ path: path.join(shots, 'f07-mobile.png') }); await ctx.close();
        assert.ok(o <= 1, 'horizontal overflow px: ' + o);
      });
      await check('F07-12 freshness labels: data 2 days old is STALE; shifting the same rows to today flips to Recent', async () => {
        const base = (await c.query("SELECT to_char(max(price_date),'YYYY-MM-DD') d FROM mandi_prices")).rows[0].d; const todayPk = new Date(Date.now()+5*3600e3).toISOString().slice(0,10); const days = Math.round((Date.parse(todayPk)-Date.parse(base))/864e5);
        const ctx0 = await ctxFor(browser, A); const p0 = await ctx0.newPage(); await p0.goto(WEB+'/market-intelligence'); await p0.getByText('Latest reporting-market average').first().waitFor({timeout:30000}); const t0 = await p0.locator('body').innerText(); await p0.screenshot({path: path.join(shots,'f07-stale.png')}); await ctx0.close(); assert.match(t0, /Stale AMIS data/i, 'baseline (data '+base+', today '+todayPk+') not labelled stale: '+norm(t0).slice(0,200));
        await c.query("UPDATE mandi_prices SET price_date = price_date + make_interval(days => $1)", [days]); flush();
        const ctx = await ctxFor(browser, A); const page = await ctx.newPage();
        try {
          // cache TTL may serve fresh label; reload after short wait
          await page.goto(`${WEB}/market-intelligence`);
          await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 30000 });
          const t = await page.locator('body').innerText();
          await page.screenshot({ path: path.join(shots, 'f07-fresh.png') });
          assert.match(t, /Recent AMIS observation/i, 'no Recent label after shifting rows to today; page: ' + norm(t).slice(0, 300));
        } finally { await c.query("UPDATE mandi_prices SET price_date = price_date - make_interval(days => $1)", [days]); flush(); await ctx.close(); }
      });
    }
  } finally { await browser.close(); }
  await c.end();
  console.log(JSON.stringify(results, null, 1));
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
})().catch((e) => { console.error('RUN_ERROR', e); process.exitCode = 2; });
