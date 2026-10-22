// F07 resilience: Redis outage, PostgreSQL outage, API rate limit via the BFF. Drives docker stop/start on qa2 containers only.
const assert = require('node:assert/strict');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const { db, farmer, call, check, results, WEB } = require('./lib.cjs');
const sh = (cmd) => execSync(cmd, { stdio: 'pipe' }).toString();
const shots = path.resolve(__dirname, '../qa2-logs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitReady = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:4022/api/v1/ready')).ok) return; } catch {} await sleep(2000); } throw new Error('API not ready'); };
(async () => {
  let c = await db();
  const A = await farmer(c, 'A7o');
  const browser = await chromium.launch({ headless: true });
  const open = async (who) => { const ctx = await browser.newContext(); await ctx.addCookies([{ name: 'fg_access', value: who.token, url: WEB, httpOnly: true, sameSite: 'Lax' }]); return ctx; };
  try {
    await check('F07-O1 Redis down: prices still served from PostgreSQL (cache degraded, not failed)', async () => {
      sh('docker stop qa2-redis');
      try {
        await sleep(1500);
        const r = await call('GET', '/market/prices?crop=Wheat&province=Punjab', { token: A.token });
        assert.equal(r.status, 200, `HTTP ${r.status} ${r.text.slice(0, 200)}`);
        assert.ok(r.json.records.length > 0);
        return `HTTP 200 records=${r.json.records.length} cache=${r.json.cache}`;
      } finally { sh('docker start qa2-redis'); await sleep(4000); }
    });
    await check('F07-O2 PostgreSQL down: API fails closed (no stale invention) and browser shows an error card with Try again; recovers after restart', async () => {
      sh('docker exec qa2-redis redis-cli flushall');
      const ctx = await open(A); const page = await ctx.newPage();
      await page.goto(`${WEB}/market-intelligence`); await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 30000 });
      sh('docker exec qa2-redis redis-cli flushall');
      sh('docker stop qa2-postgres');
      let detail = ''; let fail = null;
      try {
        await sleep(2000);
        const r = await call('GET', '/market/prices?crop=Wheat&province=Punjab', { token: A.token });
        detail = `API HTTP ${r.status} ${r.json?.error?.code ?? ''}`;
        assert.ok(r.status >= 500 && r.status < 600 || r.status === 401, 'expected controlled failure, got ' + r.status);
        await page.reload(); await sleep(6000);
        const url = page.url(); const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
        await page.screenshot({ path: path.join(shots, 'f07-db-down.png') });
        detail += ` | page url=${new URL(url).pathname} errorCard=${/Market preview unavailable/.test(body)} login=${/sign in|log in/i.test(body)}`;
        assert.ok(/Market preview unavailable/.test(body), 'no error card; ' + detail);
      } catch (e) { fail = e; } finally { sh('docker start qa2-postgres'); await waitReady(); await sleep(3000); c = await db(); }
      const cookies = (await ctx.cookies()).map((x) => x.name);
      detail += ` | cookiesAfter=${cookies.join(',') || 'NONE'}`;
      if (fail) { await ctx.close(); throw new Error(fail.message + detail); }
      await page.goto(`${WEB}/market-intelligence`);
      await page.getByText('Latest reporting-market average').first().waitFor({ timeout: 40000 }).catch(() => { throw new Error('did not recover after DB restart (session cookie cleared by outage?) ' + detail + ' url=' + page.url()); });
      await ctx.close();
      return detail;
    });
    await check('F07-O3 API rate limit (120/min) reached through the BFF without 5xx', async () => {
      const codes = {};
      const ctx = await open(A);
      for (let i = 0; i < 135; i++) { const r = await ctx.request.get(`${WEB}/api/market/prices?crop=Wheat&limit=1`); codes[r.status()] = (codes[r.status()] || 0) + 1; }
      await ctx.close();
      assert.ok(codes[429], 'no 429 observed: ' + JSON.stringify(codes)); assert.ok(!Object.keys(codes).some((k) => k >= 500), JSON.stringify(codes));
      return JSON.stringify(codes);
    });
    await check('F07-O4 after a rate-limit burst a valid session is NOT signed out (no redirect to login, cookie kept)', async () => {
      const ctx = await open(A); const page = await ctx.newPage();
      await page.goto(`${WEB}/market-intelligence`, { waitUntil: 'domcontentloaded' });
      await sleep(5000);
      const u = new URL(page.url()).pathname; const names = (await ctx.cookies()).map((x) => x.name);
      await page.screenshot({ path: path.join(shots, 'f07-after-burst.png') });
      await ctx.close();
      assert.ok(!/login/.test(u) && names.includes('fg_access'), `farmer was signed out after rate limit: url=${u} cookies=${names.join(',')}`);
      return `url=${u} cookies=${names.join(',')}`;
    });
    await check('F07-O5 rate limit is per-user: farmer B unaffected by A burst', async () => {
      // A burst again then B call within the same minute
      const ctxA = await open(A);
      for (let i = 0; i < 125; i++) await ctxA.request.get(`${WEB}/api/market/prices?crop=Wheat&limit=1`);
      await ctxA.close();
      const B = await farmer(c, 'B7o'); const ctxB = await open(B);
      const r = await ctxB.request.get(`${WEB}/api/market/prices?crop=Wheat&limit=1`); const st = r.status(); await ctxB.close();
      assert.equal(st, 200, `farmer B got HTTP ${st} while only farmer A was bursting (limiter keyed on shared BFF IP)`);
    });
  } finally { await browser.close(); }
  await c.end();
  console.log(JSON.stringify(results, null, 1));
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
})().catch((e) => { console.error('RUN_ERROR', e); process.exitCode = 2; });
