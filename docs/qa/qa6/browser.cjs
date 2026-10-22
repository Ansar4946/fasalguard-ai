// QA6 browser verification: auth password enforcement, CSP/security headers, assistant mic/audio, Postgres outage.
// Stack: API :4046, web :3046 (see start-stack.sh). Secrets come from env only; nothing sensitive is printed.
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(root, 'node_modules/playwright'));
const { Client } = createRequire(path.join(root, 'services/api/package.json'))('pg');
const API = 'http://localhost:4046/api/v1', WEB = 'http://localhost:3046';
const PG = process.env.QA6_PG || 'qa6pw';
const LOGS = path.join(root, 'docs/qa/qa6-logs');
const results = []; const out = { csp: {}, notes: [] };
const rec = (id, status, detail) => { results.push({ id, status, detail: String(detail).slice(0, 900) }); console.log(`${status} ${id} :: ${String(detail).slice(0, 400)}`); };
const flush = () => { try { execSync('docker exec qa6-redis redis-cli flushall', { stdio: 'ignore' }); } catch {} };
const sh = (c) => execSync(c, { stdio: 'pipe' }).toString().trim();
const password = 'Qa6-Known-Password-91!';
const email = `qa6-${Date.now()}@example.invalid`;
const device = { deviceIdentifier: 'qa6-browser-device', platform: 'web' };
const J = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fgCookies = async (ctx) => (await ctx.cookies()).filter((c) => c.name.startsWith('fg_')).map((c) => c.name);

const VIOL_INIT = () => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ directive: e.violatedDirective, effective: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, sample: (e.sample || '').slice(0, 80) }));
};
async function visit(ctx, url, { settle = 7000, tag, actions } = {}) {
  const page = await ctx.newPage(); await page.addInitScript(VIOL_INIT);
  const consoleCsp = [], consoleErr = [], failed = [], pageErr = [];
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|violates the following/i.test(t)) consoleCsp.push(t.slice(0, 400)); else if (m.type() === 'error') consoleErr.push(t.slice(0, 200)); });
  page.on('pageerror', (e) => pageErr.push(String(e.message).slice(0, 200)));
  page.on('requestfailed', (r) => failed.push({ url: r.url().slice(0, 120), err: r.failure()?.errorText }));
  const resp = await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ _e: e.message }));
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {}); await wait(settle);
  if (actions) await actions(page);
  const violations = await page.evaluate(() => window.__csp || []).catch(() => []);
  const headers = resp && resp.headers ? resp.headers() : {};
  const leaflet = await page.evaluate(() => ({ containers: document.querySelectorAll('.leaflet-container').length, tiles: document.querySelectorAll('img.leaflet-tile').length, tilesLoaded: [...document.querySelectorAll('img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 0).length, vectors: document.querySelectorAll('.leaflet-overlay-pane path').length })).catch(() => null);
  const info = { leaflet, url: page.url().replace(WEB, ''), status: resp?.status?.(), csp_header: Boolean(headers['content-security-policy']), violations, consoleCsp, failed, consoleErr: consoleErr.slice(0, 5), pageErr: pageErr.slice(0, 3), title: await page.title().catch(() => '') };
  out.csp[tag || url] = info; return { page, info };
}

(async () => {
  flush();
  // ---- setup: user with known password via the same register endpoint onboarding uses
  const reg = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, fullName: 'QA6 Farmer', device, consents: [{ type: 'LOCATION_PROCESSING', policyVersion: '2026-08', granted: true }, { type: 'AI_IMAGE_ANALYSIS', policyVersion: '2026-08', granted: false }] }) });
  const regBody = await J(reg); const userId = regBody?.user?.id;
  rec('SETUP register known-password user (API /auth/register)', reg.status === 201 ? 'PASS' : 'FAIL', `status ${reg.status}, role ${regBody?.user?.role}`);
  const token = regBody?.tokens?.accessToken;
  const pg = new Client({ connectionString: `postgres://postgres:${PG}@localhost:55446/qa6c` }); await pg.connect();
  await pg.query("UPDATE subscriptions SET plan_code='FARM_BUSINESS' WHERE user_id=$1", [userId]).catch(() => {});
  const crop = (await pg.query("SELECT id FROM crops WHERE slug='cotton'")).rows[0]?.id;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const farmR = await fetch(`${API}/farms`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'QA6 Farm', soilType: 'Loam', boundary: { type: 'Polygon', coordinates: [[[71.4, 30.1], [71.42, 30.1], [71.42, 30.12], [71.4, 30.12], [71.4, 30.1]]] } }) });
  const farm = await J(farmR);
  const fieldR = await fetch(`${API}/farms/${farm.id}/fields`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'QA6 Field', boundary: { type: 'Polygon', coordinates: [[[71.405, 30.105], [71.41, 30.105], [71.41, 30.11], [71.405, 30.11], [71.405, 30.105]]] }, currentCropCycle: { cropId: crop, sowingDate: '2026-08-01', expectedHarvestDate: '2026-12-01', growthStage: 'germination', status: 'active' } }) });
  await J(fieldR);
  rec('SETUP farm + field created', farmR.status < 300 && fieldR.status < 300 ? 'PASS' : 'FAIL', `farm ${farmR.status}, field ${fieldR.status}`);
  await pg.end();

  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const PH = process.env.PHASE || 'all'; const main = PH !== 'resilience', resil = PH !== 'main';
  if (main) {
  // ================= (2) LOGIN REQUIRES PASSWORD =================
  flush();
  const ctx0 = await browser.newContext();
  let r = await ctx0.request.post(`${WEB}/api/auth/login`, { data: { identifier: email }, headers: { origin: WEB } });
  rec('AUTH-1 identifier-only POST /api/auth/login (web BFF) rejected', r.status() === 400 && !(await fgCookies(ctx0)).length && !/accessToken/.test(await r.text()) ? 'PASS' : 'FAIL', `status ${r.status()}, cookies ${(await fgCookies(ctx0)).length}`);
  r = await ctx0.request.post(`${WEB}/api/auth/login`, { data: { identifier: email, password: '' }, headers: { origin: WEB } });
  rec('AUTH-1b empty password via BFF rejected', r.status() === 400 && !(await fgCookies(ctx0)).length ? 'PASS' : 'FAIL', `status ${r.status()}`);
  const direct = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: email, device }) });
  const directBody = await direct.text();
  rec('AUTH-1c identifier-only POST to Nest API /auth/login rejected', [400, 401].includes(direct.status) && !/accessToken/.test(directBody) ? 'PASS' : 'FAIL', `status ${direct.status}`);
  r = await ctx0.request.post(`${WEB}/api/auth/login`, { data: { identifier: email, password: 'Wrong-Password-123!' }, headers: { origin: WEB } });
  rec('AUTH-2a wrong password via BFF -> 401, no cookie', r.status() === 401 && !(await fgCookies(ctx0)).length ? 'PASS' : 'FAIL', `status ${r.status()}, body ${JSON.stringify(await J(r)).slice(0, 150)}`);
  await ctx0.close();

  const ctx1 = await browser.newContext(); const lp = await ctx1.newPage(); await lp.addInitScript(VIOL_INIT);
  await lp.goto(`${WEB}/login`); await lp.waitForLoadState('networkidle').catch(() => {}); await wait(1500); await lp.fill('input[name=identifier]', email); await lp.fill('input[name=password]', 'Wrong-Password-123!');
  await lp.click('button[type=submit]'); const alertLoc = lp.locator('[role=alert]').filter({ hasText: /\S/ }); await alertLoc.first().waitFor({ timeout: 15000 }).catch(() => {});
  const alertText = (await alertLoc.first().innerText().catch(() => '')).trim();
  if (!alertText) out.loginFailDom = { body: (await lp.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600), shot: await lp.screenshot({ path: path.join(LOGS, 'auth-2b.png') }).then(() => 'auth-2b.png') };
  rec('AUTH-2b UI wrong password -> error shown, stays on /login, no cookie', alertText && lp.url().includes('/login') && !(await fgCookies(ctx1)).length ? 'PASS' : 'FAIL', `alert="${alertText.slice(0, 120)}", url ${lp.url().replace(WEB, '')}, fg cookies ${(await fgCookies(ctx1)).length}`);
  await lp.fill('input[name=password]', password); await lp.click('button[type=submit]');
  await lp.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {});
  const ck = await ctx1.cookies();
  rec('AUTH-3 UI correct password -> /dashboard with session cookies', lp.url().includes('/dashboard') && ['fg_access', 'fg_refresh'].every((n) => ck.some((c) => c.name === n)) ? 'PASS' : 'FAIL', `url ${lp.url().replace(WEB, '')}, cookies ${ck.filter((c) => c.name.startsWith('fg_')).map((c) => `${c.name}(httpOnly=${c.httpOnly},secure=${c.secure},sameSite=${c.sameSite})`).join(' ')}`);
  await lp.close();

  flush();
  const ctx2 = await browser.newContext();
  const ob = await ctx2.request.post(`${WEB}/api/auth/onboarding`, { headers: { origin: WEB }, data: { fullName: 'QA6 Onboard', email: `qa6-ob-${Date.now()}@example.invalid`, preferredLanguage: 'en', anonymousContribution: false, nearbyAlerts: true, weatherAlerts: true, taskReminders: true } });
  const obBody = await J(ob);
  rec('AUTH-4 onboarding route creates account + session (password is random/emailed)', ob.status() === 201 && (await fgCookies(ctx2)).length === 2 ? 'PASS' : 'FAIL', `status ${ob.status()}, emailDelivery=${obBody?.emailDelivery}, cookies ${(await fgCookies(ctx2)).length}`);
  await ctx2.close();

  // ================= (3) CSP / security headers =================
  const hr = await fetch(`${WEB}/login`); const h = Object.fromEntries(hr.headers);
  const want = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];
  out.headers = Object.fromEntries(want.map((k) => [k, h[k] || null])); out.headers['strict-transport-security'] = h['strict-transport-security'] || null;
  rec('CSP-0 security headers present on /login', want.every((k) => h[k]) ? 'PASS' : 'FAIL', `missing: ${want.filter((k) => !h[k]).join(',') || 'none'}; HSTS=${Boolean(h['strict-transport-security'])}`);

  const anon = await browser.newContext(); await visit(anon, '/login', { tag: '/login (anon)' }); await anon.close();
  const pages = ['/dashboard', '/farms', '/farms/new', `/farms/${farm.id}`, `/farms/${farm.id}/edit`, `/farms/${farm.id}/fields`, '/fields', '/satellite', '/radar', '/weather', '/market-intelligence', '/learning', '/scan', '/tasks', '/alerts', '/irrigation', '/analytics'];
  for (const p of pages) { flush(); await visit(ctx1, p, { settle: 6000 }).then(({ page }) => page.close()); }
  for (const [p, i] of Object.entries(out.csp)) {
    const v = i.violations.length + i.consoleCsp.length;
    const cspFailed = i.failed.filter((f) => /BLOCKED_BY_CSP/.test(f.err || ''));
    const netFailed = i.failed.filter((f) => !/BLOCKED_BY_CSP/.test(f.err || ''));
    const landed = i.url.split('?')[0]; const bounced = landed.startsWith('/login') && !p.startsWith('/login');
    rec(`CSP page ${p}`, bounced ? 'BLOCKED' : (i.status && i.status < 400 && !v && !cspFailed.length ? 'PASS' : 'FAIL'), `${bounced ? 'SESSION LOST - redirected to login, page not exercised; ' : ''}http ${i.status} -> ${i.url}; csp violations ${i.violations.length}, csp console ${i.consoleCsp.length}, csp-blocked requests ${cspFailed.length}; leaflet ${JSON.stringify(i.leaflet)}; non-CSP network failures ${netFailed.length}${netFailed.length ? ' (' + [...new Set(netFailed.map((f) => new URL(f.url).host + ' ' + f.err))].slice(0, 3).join('; ') + ')' : ''}; page errors ${i.pageErr.length}`);
  }
  {
    const { page, info } = await visit(ctx1, '/farms/new', { tag: 'probe-page(/farms/new)', settle: 8000 });
    const leaflet = await page.evaluate(() => ({ container: document.querySelectorAll('.leaflet-container').length, tiles: document.querySelectorAll('img.leaflet-tile').length, loaded: [...document.querySelectorAll('img.leaflet-tile')].filter((i) => i.complete && i.naturalWidth > 0).length, paths: document.querySelectorAll('.leaflet-overlay-pane path').length }));
    out.leaflet = leaflet; rec('CSP-MAP leaflet container renders (tiles may be offline)', leaflet.container ? 'PASS' : 'BLOCKED', JSON.stringify(leaflet) + ` csp-violations ${info.violations.length}`);
    const probe = await page.evaluate(async () => {
      const urls = ['https://a.tile.openstreetmap.org/0/0/0.png', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0', 'https://lh3.googleusercontent.com/x.png', 'https://example.com/x.png'];
      const res = {}; window.__csp = [];
      await Promise.all(urls.map((u) => new Promise((ok) => { const i = new Image(); i.onload = () => { res[u] = 'loaded'; ok(); }; i.onerror = () => { res[u] = 'error'; ok(); }; i.src = u; setTimeout(ok, 6000); })));
      return { res, viol: window.__csp.map((v) => `${v.directive} <- ${v.blocked}`) };
    });
    out.imgProbe = probe; rec('CSP-IMG img-src probe (OSM, Esri, googleusercontent, arbitrary https)', probe.viol.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(probe));
    const neg = await page.evaluate(async () => { window.__csp = []; try { await fetch('https://example.com/'); } catch {} const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.head.appendChild(s); await new Promise((r) => setTimeout(r, 1500)); return window.__csp.map((v) => v.directive); });
    out.negControl = neg; rec('CSP-NEG negative control: fetch/script to example.com blocked by connect-src/script-src', neg.some((d) => /connect-src/.test(d)) && neg.some((d) => /script-src/.test(d)) ? 'PASS' : 'FAIL', JSON.stringify(neg));
    await page.close();
  }

  // ================= /assistant: mic + audio =================
  {
    flush(); const mctx = await browser.newContext({ permissions: ['microphone'] });
    { const lg = await mctx.newPage(); await lg.goto(WEB + '/login'); await lg.fill('input[name=identifier]', email); await lg.fill('input[name=password]', password); await lg.click('button[type=submit]'); await lg.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {}); await lg.close(); }
    const mcookies = await mctx.cookies(); flush();
    const WAV = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const stubOn = (ctxx, pat, body) => ctxx.route(pat, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
    // The speech provider is not configured here (BLOCKED_EXTERNAL), so its three BFF endpoints are stubbed; presign/upload/complete stay REAL.
    const stub = (pat, body) => stubOn(mctx, pat, body);
    await stub('**/api/assistant/speech/capabilities', { available: true, sttLanguages: ['ur', 'hi', 'en'], ttsLanguages: ['ur', 'hi', 'en'], acceptedContentTypes: ['audio/webm', 'audio/webm;codecs=opus', 'audio/wav'], maxRecordingSeconds: 30, consentVersion: 'qa6', consentGranted: true });
    await stub('**/api/assistant/speech/consent', { ok: true });
    await stub('**/api/assistant/speech/transcribe', { transcript: 'QA6 stubbed transcript' });
    await stub('**/api/assistant/speech/synthesize', { audioBase64: WAV, contentType: 'audio/wav' });
    const caps = await (await mctx.request.get(`${WEB}/api/assistant/speech/capabilities`)).text();
    out.speechCaps = caps.slice(0, 300);
    const { page, info } = await visit(mctx, '/assistant', {
      tag: '/assistant (mic+audio)', settle: 4000,
      actions: async (pg) => {
        out.mic = {};
        out.mic.policyAllows = await pg.evaluate(() => { try { return document.featurePolicy.allowsFeature('microphone'); } catch { return 'n/a'; } });
        const status = async () => (await pg.locator('p[aria-live], [role=status]').first().innerText().catch(() => '')).slice(0, 150);
        out.mic.initialStatus = await status();
        const cb = pg.locator('input[type=checkbox]').first(); if (await cb.count()) await cb.check().catch(() => {});
        const sel = pg.locator('select'); if (await sel.count()) await sel.first().selectOption('en').catch(() => {});
        const startBtn = pg.getByRole('button', { name: 'Start recording' });
        out.mic.startEnabled = await startBtn.isEnabled().catch(() => false);
        if (out.mic.startEnabled) {
          await startBtn.click(); await wait(2500);
          out.mic.recordingBtn = await pg.getByRole('button', { name: 'Stop recording' }).count();
          if (out.mic.recordingBtn) await pg.getByRole('button', { name: 'Stop recording' }).click();
          await wait(4000); out.mic.afterStopStatus = await status();
        }
        const ta = pg.locator('textarea').last(); if (await ta.count()) await ta.fill('Water the wheat field early in the morning.');
        const play = pg.getByRole('button', { name: 'Play transcript' }); out.mic.playEnabled = await play.isEnabled().catch(() => false);
        if (out.mic.playEnabled) { await play.click(); await wait(4000); out.mic.afterPlayStatus = await status(); }
        out.mic.dataAudio = await pg.evaluate(() => new Promise((res) => {
          const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          const a = new Audio('data:audio/wav;base64,' + wav); a.onerror = () => res('error:' + (a.error && a.error.code)); a.onloadeddata = () => res('loadeddata'); a.oncanplaythrough = () => res('canplaythrough'); a.load(); setTimeout(() => res('timeout'), 4000);
        }));
        out.mic.blobAudio = await pg.evaluate(() => new Promise((res) => { const u8 = Uint8Array.from(atob('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='), (c) => c.charCodeAt(0)); const b = new Blob([u8], { type: 'audio/wav' }); const a = new Audio(URL.createObjectURL(b)); a.onerror = () => res('error:' + (a.error && a.error.code)); a.onloadedmetadata = () => res('loadedmetadata'); a.load(); setTimeout(() => res('timeout'), 4000); }));
      },
    });
    rec('ASSIST-1 /assistant loads, no CSP violation (incl. mic recording + audio playback path)', info.status < 400 && !info.violations.length && !info.consoleCsp.length ? 'PASS' : 'FAIL', `violations=${JSON.stringify(info.violations)} consoleCsp=${JSON.stringify(info.consoleCsp)} failed=${JSON.stringify(info.failed.slice(0, 4))}`);
    rec('ASSIST-2 Permissions-Policy allows microphone for self', out.mic.policyAllows === true ? 'PASS' : 'FAIL', `allowsFeature(microphone)=${out.mic.policyAllows}`);
    rec('ASSIST-3 mic recording flow (fake device, permission granted)', out.mic.recordingBtn ? 'PASS' : (out.mic.startEnabled ? 'FAIL' : 'BLOCKED'), JSON.stringify(out.mic));
    rec('ASSIST-4 audio data:/blob: URL accepted by media-src', /load|canplay/.test(out.mic.dataAudio || '') && /load/.test(out.mic.blobAudio || '') ? 'PASS' : 'FAIL', `data=${out.mic.dataAudio} blob=${out.mic.blobAudio}`);
    await page.close(); await mctx.close();
    const b2 = await chromium.launch({ headless: true }); const c2 = await b2.newContext(); await c2.addCookies(mcookies);
    for (const [pat, body] of [['**/api/assistant/speech/capabilities', { available: true, sttLanguages: ['ur', 'hi', 'en'], ttsLanguages: ['ur', 'hi', 'en'], acceptedContentTypes: ['audio/webm', 'audio/webm;codecs=opus', 'audio/wav'], maxRecordingSeconds: 30, consentVersion: 'qa6', consentGranted: true }], ['**/api/assistant/speech/consent', { ok: true }]]) await stubOn(c2, pat, body);
    const p2 = await c2.newPage(); await p2.addInitScript(VIOL_INIT); await p2.goto(`${WEB}/assistant`); await wait(4000);
    const sel2 = p2.locator('select'); if (await sel2.count()) await sel2.first().selectOption('en').catch(() => {});
    const cb2 = p2.locator('input[type=checkbox]').first(); if (await cb2.count()) await cb2.check().catch(() => {});
    const sb = p2.getByRole('button', { name: 'Start recording' }); let st = 'n/a';
    if (await sb.isEnabled().catch(() => false)) { await sb.click(); await wait(3000); st = (await p2.locator('p[aria-live], [role=status]').first().innerText().catch(() => '')).slice(0, 200); }
    out.micDenied = { status: st, violations: await p2.evaluate(() => window.__csp) };
    rec('ASSIST-5 permission prompt path (not granted): graceful message, no CSP violation', st !== 'n/a' && !out.micDenied.violations.length ? 'PASS' : 'BLOCKED', JSON.stringify(out.micDenied));
    await b2.close();
  }

  }
  if (resil) {
  // ================= (4a) rate-limit (429) must not log the user out =================
  flush();
  {
    const rctx = await browser.newContext(); const rp = await rctx.newPage();
    await rp.goto(`${WEB}/login`); await rp.fill('input[name=identifier]', email); await rp.fill('input[name=password]', password); await rp.click('button[type=submit]'); await rp.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {});
    const rtok = (await rctx.cookies()).find((c) => c.name === 'fg_access').value;
    let n429 = 0; for (let i = 0; i < 140; i++) { const x = await fetch(`${API}/auth/me`, { headers: { authorization: `Bearer ${rtok}` } }); if (x.status === 429) n429++; }
    const bm = await rctx.request.get(`${WEB}/api/auth/me`);
    const raw = await rctx.request.get(`${WEB}/dashboard`, { maxRedirects: 0 });
    out.rateLimit = { api429s: n429, bffMeStatus: bm.status(), cookiesAfterBffMe: await fgCookies(rctx), proxyStatus: raw.status(), proxyLocation: raw.headers().location };
    rec('RL-1 API 429 (per-user limit exhausted) must not be treated as logout: BFF /api/auth/me keeps cookies', n429 > 0 && bm.status() !== 401 && out.rateLimit.cookiesAfterBffMe.length === 2 ? 'PASS' : (n429 ? 'FAIL' : 'BLOCKED'), JSON.stringify(out.rateLimit));
    await rctx.close();
  }
  await wait(65000); // the API rate limiter is in-memory; let the exhausted window expire
  flush();
  // ================= (4) Postgres outage =================
  const octx = await browser.newContext(); const op = await octx.newPage();
  await op.goto(`${WEB}/login`); await op.fill('input[name=identifier]', email); await op.fill('input[name=password]', password); await op.click('button[type=submit]'); await op.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {});
  const before = await fgCookies(octx);
  rec('OUT-0 signed in before outage', op.url().includes('/dashboard') && before.length === 2 ? 'PASS' : 'FAIL', `url ${op.url().replace(WEB, '')}`);
  const tok = (await octx.cookies()).find((c) => c.name === 'fg_access').value;
  // second signed-in context to isolate the BFF /api/auth/me behaviour from page navigation
  const octx2 = await browser.newContext(); { const lg = await octx2.newPage(); await lg.goto(`${WEB}/login`); await lg.fill('input[name=identifier]', email); await lg.fill('input[name=password]', password); await lg.click('button[type=submit]'); await lg.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {}); await lg.close(); }
  const octx3 = await browser.newContext(); await octx3.addCookies(await octx2.cookies());
  sh('docker stop qa6-pg'); await wait(3000);
  {
    const raw = await octx3.request.get(`${WEB}/dashboard`, { maxRedirects: 0 });
    const sc = raw.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value.split(';')[0].split('=')[0] + '=' + (h.value.split(';')[0].split('=')[1] ? '<set>' : '<cleared>'));
    out.proxyRaw = { status: raw.status(), location: raw.headers().location, setCookie: sc };
    rec('OUT-1a proxy (no JS) during outage: redirect target and cookie handling', raw.status() >= 300 && sc.every((x) => !x.endsWith('<cleared>')) ? 'PASS' : 'FAIL', JSON.stringify(out.proxyRaw));
    const bm = await octx2.request.get(`${WEB}/api/auth/me`);
    const bsc = bm.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value.split(';')[0].split('=')[0] + '=' + (h.value.split(';')[0].split('=')[1] ? '<set>' : '<cleared>'));
    out.bffMe = { status: bm.status(), setCookie: bsc, cookiesAfter: await fgCookies(octx2) };
    rec('OUT-1b BFF GET /api/auth/me during outage must not clear session (expect 503, cookies kept)', bm.status() === 503 && out.bffMe.cookiesAfter.length === 2 ? 'PASS' : 'FAIL', JSON.stringify(out.bffMe));
  }
  const me = await fetch(`${API}/auth/me`, { headers: { authorization: `Bearer ${tok}` } }); out.apiMeDuringOutage = { status: me.status, body: (await me.text()).slice(0, 200) };
  const nav = [];
  for (const p of ['/dashboard', '/farms', '/assistant']) {
    const resp = await op.goto(WEB + p, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ status: () => 'ERR ' + e.message.slice(0, 60) }));
    await wait(2500); nav.push({ to: p, finalUrl: op.url().replace(WEB, ''), status: resp.status(), cookies: await fgCookies(octx), body: (await op.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140) });
  }
  out.outageNav = nav;
  const stillCookies = (await fgCookies(octx)).length === 2;
  const redirectedToLogin = nav.some((n) => n.finalUrl.startsWith('/login'));
  rec('OUT-1 cookies retained while Postgres is down (no logout)', stillCookies ? 'PASS' : 'FAIL', `API /auth/me during outage -> ${out.apiMeDuringOutage.status}; nav ${JSON.stringify(nav.map((n) => [n.to, n.finalUrl, n.status]))}`);
  rec('OUT-2 authenticated page navigation stays on the page (503-type handling, not redirect to /login)', !redirectedToLogin ? 'PASS' : 'FAIL', redirectedToLogin ? `redirected to ${nav.find((n) => n.finalUrl.startsWith('/login')).finalUrl}` : 'stayed');
  sh('docker start qa6-pg');
  let healthy = false; for (let i = 0; i < 40 && !healthy; i++) { await wait(3000); try { healthy = (await fetch(`${API}/auth/me`, { headers: { authorization: `Bearer ${tok}` } })).status === 200; } catch {} }
  out.recoveryAfterSec = healthy ? 'recovered' : 'not recovered in 120 s';
  const resp = await op.goto(WEB + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null); await wait(3000);
  rec('OUT-3 after Postgres restart, /dashboard loads with the same cookies (no re-login)', healthy && op.url().includes('/dashboard') && (await fgCookies(octx)).length === 2 ? 'PASS' : 'FAIL', `api me ok=${healthy}, url ${op.url().replace(WEB, '')}, status ${resp?.status()}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(LOGS, `browser-results-${PH}.json`), JSON.stringify({ results, out }, null, 2));
  const c = results.reduce((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {}); console.log('SUMMARY', JSON.stringify(c));
})().catch((e) => { console.error('SCRIPT ERROR', e.message); fs.writeFileSync(path.join(LOGS, 'browser-results-error.json'), JSON.stringify({ results, out, error: e.message }, null, 2)); process.exit(1); });
