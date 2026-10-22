// QA6 diagnostic: why did the session drop mid-way through the CSP page sweep? Logs /auth/me status after each page.
const path = require('node:path'); const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(root, 'node_modules/playwright'));
const API = 'http://localhost:4046/api/v1', WEB = 'http://localhost:3046';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('node:child_process').execSync('docker exec qa6-redis redis-cli flushall');
  const email = process.env.QA6_EMAIL; const password = process.env.QA6_PW;
  const b = await chromium.launch({ headless: true }); const ctx = await b.newContext(); const p = await ctx.newPage();
  const statuses = {}; p.on('response', (r) => { if (r.url().startsWith(WEB)) { const k = r.status() + ' ' + new URL(r.url()).pathname.split('/').slice(0, 3).join('/'); statuses[k] = (statuses[k] || 0) + 1; } });
  await p.goto(WEB + '/login'); await p.fill('input[name=identifier]', email); await p.fill('input[name=password]', password); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  for (const pg of ['/dashboard', '/farms', '/satellite', '/weather', '/radar', '/market-intelligence']) {
    const t0 = Date.now(); await p.goto(WEB + pg, { waitUntil: 'load' }); await wait(5000);
    const c = (await ctx.cookies()).find((x) => x.name === 'fg_access');
    let me = 'no-cookie'; if (c) { const t = Date.now(); const r = await fetch(API + '/auth/me', { headers: { authorization: 'Bearer ' + c.value } }); me = r.status + ' in ' + (Date.now() - t) + 'ms'; }
    console.log(pg, '->', p.url().replace(WEB, ''), '| api /auth/me', me, '| load', Date.now() - t0, 'ms');
  }
  console.log(JSON.stringify(statuses)); await b.close();
})();
