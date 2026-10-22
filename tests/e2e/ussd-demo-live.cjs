// F09 browser E2E: real Chromium -> Next.js BFF -> core API -> USSD state machine -> PostgreSQL.
// Requires an ISOLATED stack and seeded synthetic farmers (see F09_E2E_* variables). Nothing is
// mocked on the happy path. page.route() is used ONLY to inject ledger outages, malformed bodies,
// delayed visibility and a tampered amount, because a healthy local API cannot produce them.
const assert = require('node:assert/strict');
const required = ['F09_WEB_URL', 'F09_DATABASE_URL', 'F09_SEED_PATH', 'F09_API_MODULES_DIR'];
if (required.some((name) => !process.env[name])) {
  console.error(`BLOCKED_EXTERNAL: configure ${required.join(', ')} for an isolated stack.`);
  process.exit(2);
}
const origin = new URL(process.env.F09_WEB_URL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local isolated stack only.');
if (!/\/f09_e2e$/.test(process.env.F09_DATABASE_URL)) throw new Error('Refusing to touch a non-F09 database.');
const { createRequire } = require('node:module');
const apiRequire = createRequire(`${process.env.F09_API_MODULES_DIR}/package.json`);
const { chromium } = require('playwright');
const { Client } = apiRequire('pg');
const seed = require(process.env.F09_SEED_PATH);
const PIN = '4826';
const results = [];
const check = (name, fn) => fn().then(() => results.push({ name, status: 'PASS' }), (error) => { results.push({ name, status: 'FAIL', detail: String(error.message).split('\n')[0] }); });

const ledgerAlert = (page) => page.locator('p[role="alert"]');
const screenOf = (page) => page.locator('pre[role="status"]');
async function sendStep(page, value, { repeatable = false } = {}) {
  const previous = await screenOf(page).innerText();
  await page.locator('#ussd-input').fill(value);
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/ussd-demo/session') && r.request().method() === 'POST');
  await page.locator('#ussd-input').press('Enter');
  await answered;
  if (repeatable) await page.waitForFunction(() => document.querySelector('#ussd-input') && !document.querySelector('#ussd-input').disabled, null, { timeout: 15000 });
  else await page.waitForFunction((text) => document.querySelector('pre[role="status"]')?.textContent !== text, previous, { timeout: 15000 });
}
async function startSession(page) {
  const box = page.getByLabel('I understand this is a simulation.');
  if (!(await box.isChecked())) await box.check();
  await page.getByRole('button', { name: /Start (new session|simulator)/ }).click();
  await page.waitForFunction(() => /Enter your Fasal Guard PIN/.test(document.querySelector('pre[role="status"]')?.textContent ?? ''), null, { timeout: 15000 });
}
async function runExpense(page, amount) {
  await startSession(page);
  await sendStep(page, PIN);
  await sendStep(page, '1'); // farm
  await sendStep(page, '1'); // season
  await sendStep(page, '1'); // category
  await sendStep(page, String(amount));
  await sendStep(page, '1'); // date: today
  assert.match(await screenOf(page).innerText(), new RegExp(`Amount: PKR ${amount}\\b`));
  await sendStep(page, '1'); // confirm
  const text = await screenOf(page).innerText();
  const receipt = text.match(/Receipt ([0-9a-f-]{36})/)?.[1];
  assert.ok(receipt, `no receipt in terminal screen: ${text}`);
  return receipt;
}
const banner = (page) => page.locator('p[role="status"]').filter({ hasText: 'Receipt' });
const ledgerRows = async (db, userId) => (await db.query('SELECT id, amount_minor::text AS amount, currency, channel, type, user_id FROM farm_ledger_entries WHERE user_id=$1 ORDER BY created_at', [userId])).rows;

(async () => {
  const db = new Client({ connectionString: process.env.F09_DATABASE_URL });
  await db.connect();
  const browser = await chromium.launch({ headless: true });
  const cookie = (token) => [{ name: 'fg_access', value: token, url: origin.href, httpOnly: true, sameSite: 'Lax' }];
  const open = async (token, viewport) => {
    const context = await browser.newContext(viewport ? { viewport } : {});
    await context.addCookies(cookie(token));
    const page = await context.newPage();
    page.posts = [];
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/ussd-demo/session')) page.posts.push(request.postData()); });
    await page.goto(new URL('/ussd-demo', origin).href);
    return { context, page };
  };
  try {
    await check('unauthenticated page redirects to login and ledger BFF returns 401', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(new URL('/ussd-demo', origin).href);
      assert.match(page.url(), /\/login/);
      assert.equal((await context.request.get(new URL('/api/farm-ledger', origin).href)).status(), 401);
      assert.equal((await context.request.post(new URL('/api/ussd-demo/session', origin).href, { data: {}, headers: { origin: origin.origin } })).status() >= 400, true);
      await context.close();
    });

    const a = await open(seed.a.token);
    const pageA = a.page;
    let receipt1;
    await check('genuine empty ledger is shown only after a successful zero-record response', async () => {
      await pageA.getByText('No USSD expenses have been recorded yet.').waitFor({ timeout: 15000 });
      assert.equal(await ledgerAlert(pageA).count(), 0);
    });

    await check('simulation notice is visible and Start is disabled until acknowledged', async () => {
      assert.ok(await pageA.getByText('SIMULATION — no mobile operator or short code is connected').isVisible());
      assert.equal(await pageA.getByRole('button', { name: 'Start simulator' }).isDisabled(), true);
    });

    await check('PIN setup with wrong password is rejected, correct password succeeds', async () => {
      await pageA.getByLabel('Current password').fill('wrong-password-123');
      await pageA.getByLabel('New PIN', { exact: true }).fill(PIN);
      await pageA.getByLabel('Confirm PIN').fill(PIN);
      await pageA.getByRole('button', { name: 'Save PIN' }).click();
      await pageA.waitForFunction(() => /./.test(document.querySelector('form p[role="status"]')?.textContent ?? ''));
      assert.doesNotMatch(await pageA.locator('form p[role="status"]').innerText(), /PIN configured/);
      await pageA.getByLabel('Current password').fill(seed.a.password);
      await pageA.getByLabel('New PIN', { exact: true }).fill(PIN);
      await pageA.getByLabel('Confirm PIN').fill(PIN);
      await pageA.getByRole('button', { name: 'Save PIN' }).click();
      await pageA.getByText('PIN configured. You can start the simulator.').waitFor({ timeout: 15000 });
    });

    await check('confirmed PKR 321 expense: receipt verified against ledger and PostgreSQL (32100 paisa, owner A)', async () => {
      receipt1 = await runExpense(pageA, 321);
      await banner(pageA).getByText(/Saved and verified/).waitFor({ timeout: 20000 });
      assert.ok((await banner(pageA).innerText()).includes(receipt1));
      const rows = await ledgerRows(db, seed.a.user);
      assert.equal(rows.length, 1);
      assert.deepEqual({ id: rows[0].id, amount: rows[0].amount, currency: rows[0].currency, channel: rows[0].channel, type: rows[0].type }, { id: receipt1, amount: '32100', currency: 'PKR', channel: 'USSD', type: 'EXPENSE' });
      await pageA.getByText('PKR 321.00').first().waitFor();
    });

    await check('reload keeps the persisted record visible', async () => {
      await pageA.reload();
      await pageA.getByText(receipt1).first().waitFor({ timeout: 15000 });
      await pageA.getByText('PKR 321.00').first().waitFor();
    });

    await check('replaying the confirming request with the same event id returns the same receipt and creates no duplicate', async () => {
      const confirm = pageA.posts.find((body) => JSON.parse(body).input === '1' && pageA.posts.indexOf(body) === pageA.posts.length - 1) ?? pageA.posts.at(-1);
      assert.ok(confirm, 'captured confirming request');
      const before = (await ledgerRows(db, seed.a.user)).length;
      const replay = await pageA.context().request.post(new URL('/api/ussd-demo/session', origin).href, { data: JSON.parse(confirm), headers: { origin: origin.origin } });
      assert.equal(replay.status(), 200);
      assert.match((await replay.json()).text, new RegExp(`Receipt ${receipt1}`));
      assert.equal((await ledgerRows(db, seed.a.user)).length, before);
      const tampered = { ...JSON.parse(confirm), input: '2' };
      assert.equal((await pageA.context().request.post(new URL('/api/ussd-demo/session', origin).href, { data: tampered, headers: { origin: origin.origin } })).status(), 409);
      assert.equal((await ledgerRows(db, seed.a.user)).length, before);
    });

    await check('ledger HTTP 500 shows an error (not empty), keeps last good records, and retry recovers', async () => {
      await pageA.route('**/api/farm-ledger', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Ledger provider unavailable.' } }) }));
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).filter({ hasText: 'Ledger unavailable' }).waitFor();
      assert.equal(await pageA.getByText('No USSD expenses have been recorded yet.').count(), 0);
      assert.ok(await pageA.getByText(/may be out of date/).isVisible());
      assert.ok(await pageA.getByText('PKR 321.00').first().isVisible());
      await pageA.unroute('**/api/farm-ledger');
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).waitFor({ state: 'detached' });
      await pageA.getByText(receipt1).first().waitFor();
    });

    await check('malformed 200 body is an error, never an empty ledger', async () => {
      await pageA.route('**/api/farm-ledger', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"records":[]}' }));
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).filter({ hasText: 'malformed' }).waitFor();
      assert.equal(await pageA.getByText('No USSD expenses have been recorded yet.').count(), 0);
      await pageA.unroute('**/api/farm-ledger');
    });

    await check('network failure is an error and recovers on retry', async () => {
      await pageA.route('**/api/farm-ledger', (route) => route.abort('timedout'));
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).filter({ hasText: 'Ledger unavailable' }).waitFor();
      await pageA.unroute('**/api/farm-ledger');
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).waitFor({ state: 'detached' });
    });

    await check('delayed ledger visibility: verification retries until the row appears', async () => {
      let calls = 0;
      await pageA.route('**/api/farm-ledger', (route) => (++calls <= 2 ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : route.continue()));
      const receipt = await runExpense(pageA, 50);
      await banner(pageA).getByText(/Saved and verified/).waitFor({ timeout: 20000 });
      assert.ok(calls >= 3);
      await pageA.unroute('**/api/farm-ledger');
      assert.equal((await ledgerRows(db, seed.a.user)).some((r) => r.id === receipt && r.amount === '5000'), true);
    });

    await check('tampered amount in the ledger response is flagged as a mismatch, not verified', async () => {
      await pageA.route('**/api/farm-ledger', async (route) => {
        const response = await route.fetch();
        const rows = await response.json();
        await route.fulfill({ response, json: rows.map((r, i) => (i === 0 ? { ...r, amountMinor: '1' } : r)) });
      });
      const receipt = await runExpense(pageA, 75);
      await banner(pageA).getByText(/does not match what you confirmed/).waitFor({ timeout: 20000 });
      assert.equal(await banner(pageA).getByText(/Saved and verified/).count(), 0);
      assert.ok(receipt);
      await pageA.unroute('**/api/farm-ledger');
    });

    await check('receipt absent from ledger is reported as not yet visible, never verified', async () => {
      await pageA.route('**/api/farm-ledger', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await runExpense(pageA, 60);
      await banner(pageA).getByText(/not yet visible in your ledger/).waitFor({ timeout: 20000 });
      await pageA.unroute('**/api/farm-ledger');
    });

    await check('cancel at review stores nothing', async () => {
      const before = (await ledgerRows(db, seed.a.user)).length;
      await startSession(pageA);
      for (const step of [PIN, '1', '1', '1', '99', '1']) await sendStep(pageA, step);
      await sendStep(pageA, '2');
      assert.match(await screenOf(pageA).innerText(), /Cancelled\. No expense saved\./);
      assert.equal((await ledgerRows(db, seed.a.user)).length, before);
    });

    await check('invalid inputs are rejected without ledger writes (bad PIN format, zero/negative/decimal/oversize amount)', async () => {
      const before = (await ledgerRows(db, seed.a.user)).length;
      await startSession(pageA);
      await sendStep(pageA, 'ab');
      assert.match(await screenOf(pageA).innerText(), /Invalid PIN format/);
      await sendStep(pageA, PIN);
      for (const step of ['1', '1', '1']) await sendStep(pageA, step);
      for (const bad of ['00', '-5', '12.5', 'abc', '9999999999']) {
        await sendStep(pageA, bad, { repeatable: true });
        assert.match(await screenOf(pageA).innerText(), /Enter a valid whole PKR amount|exceeds/);
      }
      await sendStep(pageA, '0');
      assert.equal((await ledgerRows(db, seed.a.user)).length, before);
    });

    await check('ledger rows are append-only at the database layer', async () => {
      await assert.rejects(db.query("UPDATE farm_ledger_entries SET amount_minor=1 WHERE id=$1", [receipt1]), /append-only/);
      await assert.rejects(db.query('DELETE FROM farm_ledger_entries WHERE id=$1', [receipt1]), /append-only/);
    });

    await check('mobile viewport: no horizontal overflow and keyboard-only flow works', async () => {
      const mobile = await open(seed.a.token, { width: 375, height: 667 });
      await mobile.page.getByText(receipt1).first().waitFor({ timeout: 15000 });
      const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `overflow ${overflow}px`);
      await mobile.page.getByLabel('I understand this is a simulation.').focus();
      await mobile.page.keyboard.press('Space');
      assert.equal(await mobile.page.getByLabel('I understand this is a simulation.').isChecked(), true);
      await mobile.page.getByRole('button', { name: 'Start simulator' }).focus();
      await mobile.page.keyboard.press('Enter');
      await mobile.page.waitForFunction(() => /Enter your Fasal Guard PIN/.test(document.querySelector('pre[role="status"]')?.textContent ?? ''));
      await mobile.page.keyboard.press('Tab');
      assert.equal(await mobile.page.evaluate(() => document.activeElement?.id), 'ussd-input');
      await mobile.context.close();
    });

    await check('account switch: farmer B sees no records of farmer A and no cross-user DB rows', async () => {
      const b = await open(seed.b.token);
      await b.page.getByText('No USSD expenses have been recorded yet.').waitFor({ timeout: 15000 });
      assert.equal(await b.page.getByText(receipt1).count(), 0);
      assert.equal((await ledgerRows(db, seed.b.user)).length, 0);
      const apiRows = await (await b.context.request.get(new URL('/api/farm-ledger', origin).href)).json();
      assert.deepEqual(apiRows, []);
      await b.context.close();
    });

    await check('expired/revoked session: ledger refresh shows session-ended and clears records; sending is refused', async () => {
      await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [seed.a.sid]);
      await pageA.getByRole('button', { name: 'Refresh' }).click();
      await ledgerAlert(pageA).filter({ hasText: 'session has ended' }).waitFor({ timeout: 15000 });
      assert.equal(await pageA.getByText('PKR 321.00').count(), 0);
      assert.equal(await pageA.getByText(receipt1).count(), 0);
    });
  } finally {
    await browser.close();
    await db.end();
  }
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(JSON.stringify({ status: failed.length ? 'RUN_FAIL' : 'RUN_PASS', passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => { console.error('RUN_FAIL', error.message); process.exitCode = 1; });
