// Prerequisite for F01-F05 ownership: sign-in must require a password. Real argon2 hash seeded in users.password_hash; real login through API and browser form.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const { db, call, check, finish, crypto, apiRequire, WEB, API, makeField, sleep } = require('./lib.cjs');
const argon2 = apiRequire('argon2');
const out = path.resolve(__dirname, '../qa7-logs');
(async () => {
  const c = await db();
  const pw = 'Qa7-' + crypto.randomBytes(9).toString('base64url'); // random, never printed
  const email = `qa7-login-${crypto.randomUUID()}@example.invalid`;
  const hash = await argon2.hash(pw, { type: argon2.argon2id });
  const u = (await c.query("INSERT INTO users(email,role,status,password_hash) VALUES($1,'FARMER','active',$2) RETURNING id", [email, hash])).rows[0];
  await c.query("INSERT INTO farmer_profiles(user_id,full_name,preferred_language,referral_code) VALUES($1,'QA7 login','en',$2)", [u.id, crypto.randomBytes(4).toString('hex').toUpperCase()]);
  const dev = { deviceIdentifier: 'qa7-device-' + crypto.randomBytes(4).toString('hex'), platform: 'web' };
  await check('AUTH-01', 'identifier-only login rejected (no password field) -> 400/401, no session row', async () => {
    const before = (await c.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1', [u.id])).rows[0].n;
    const r = await call('POST', '/auth/login', { body: { identifier: email, device: dev } }); assert.ok([400, 401].includes(r.status), 'status ' + r.status);
    const r2 = await call('POST', '/auth/login', { body: { identifier: email, password: '', device: dev } }); assert.ok([400, 401].includes(r2.status));
    assert.ok(!/accessToken/.test(r.text + r2.text));
    assert.equal((await c.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1', [u.id])).rows[0].n, before);
  });
  await check('AUTH-02', 'wrong password and unknown user give the same 401 (no account enumeration)', async () => {
    const a = await call('POST', '/auth/login', { body: { identifier: email, password: 'wrong-' + pw, device: dev } });
    const b = await call('POST', '/auth/login', { body: { identifier: 'nobody-' + email, password: 'x-' + pw, device: dev } });
    assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.json.error.message, b.json.error.message);
  });
  let tokens;
  await sleep(65000); // login throttle is 5/min per client address
  await check('AUTH-03', 'correct password -> tokens; token works on a protected F01-F05 endpoint (GET /crop-scans?fieldId needs auth) ; refresh rotates', async () => {
    const r = await call('POST', '/auth/login', { body: { identifier: email, password: pw, device: dev } }); assert.equal(r.status, 200, r.status + r.text.slice(0, 120)); tokens = r.json.tokens;
    const me = await call('GET', '/auth/me', { token: tokens.accessToken }); assert.equal(me.status, 200);
    const sc = await call('POST', '/crop-scans', { token: tokens.accessToken, body: {} }); assert.equal(sc.status, 201);
    const rf = await call('POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } }); assert.equal(rf.status, 200); assert.notEqual(rf.json.refreshToken ?? rf.json.tokens?.refreshToken, tokens.refreshToken);
    const reuse = await call('POST', '/auth/refresh', { body: { refreshToken: tokens.refreshToken } }); assert.equal(reuse.status, 401, 'old refresh token reusable: ' + reuse.status);
  });
  await sleep(65000);
  await check('AUTH-05', 'browser login form (email + password) sets session cookies and reaches the farmer area; wrong password shows an error', async () => {
    const browser = await chromium.launch({ headless: true }); const page = await (await browser.newContext()).newPage();
    await page.goto(WEB + '/login', { waitUntil: 'networkidle' });
    await page.locator('input[name=identifier]').fill(email); await page.locator('input[name=password]').fill('wrong-password-123'); await page.locator('button[type=submit]').click(); await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(out, 'auth-wrong-password.png') });
    const bad = (await page.locator('[role=alert],[role=status],.text-danger').allInnerTexts()).join(' | ') + ' || ' + await page.locator('body').innerText(); const shownMsg = bad.split('||')[0].trim(); assert.ok(shownMsg.length > 0, 'no error shown for a wrong password');
    await c.query("UPDATE auth_sessions SET revoked_at=revoked_at WHERE false");
    await page.locator('input[name=password]').fill(pw); await page.locator('button[type=submit]').click(); await page.waitForTimeout(4000);
    const cookies = (await page.context().cookies()).map((x) => x.name); const url = new URL(page.url()).pathname; await browser.close();
    if (!cookies.includes('fg_access')) { throw new Error(`login failed after throttling? cookies=${cookies} url=${url} (the form login is subject to the per-account throttle exercised by AUTH-04)`); }
    assert.ok(!/No account found/i.test(shownMsg), `wrong password for an existing account shows '${shownMsg}' (misleading: the account exists; API says 'email, phone number or password is incorrect'); correct password then logged in: cookies=${cookies.join(',')} landed=${url}`);
    return `cookies=${cookies.join(',')} landed=${url}`;
  });
  await sleep(65000);
  await check('AUTH-04', 'brute force: 12 wrong passwords -> throttled with 429 before the limit of attempts is unbounded', async () => {
    const codes = []; for (let i = 0; i < 12; i++) codes.push((await call('POST', '/auth/login', { body: { identifier: email, password: 'bad' + i, device: dev } })).status);
    assert.ok(codes.includes(429), codes.join()); return codes.join(',');
  });
  finish(path.join(out, 'auth.json'));
  await c.end();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
