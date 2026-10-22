// F12 browser E2E: real Chromium -> Next.js BFF -> core API -> PostgreSQL.
// Requires an ISOLATED stack and two synthetic farmers (F12_* variables). The notifications and their
// delivery rows are labelled test fixtures inserted directly, because producers (weather, farm brain)
// are other features; creation logic is covered by notifications.integration-spec.ts. Push delivery to a
// real phone is NOT exercised. page.route() is used only to inject outages and malformed bodies.
const assert = require('node:assert/strict');
const required = ['F12_WEB_URL', 'F12_DATABASE_URL', 'F12_SEED_PATH', 'F12_API_MODULES_DIR'];
if (required.some((name) => !process.env[name])) {
  console.error(`BLOCKED_EXTERNAL: configure ${required.join(', ')} for an isolated stack.`);
  process.exit(2);
}
const origin = new URL(process.env.F12_WEB_URL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local isolated stack only.');
if (!/\/f12_e2e$/.test(process.env.F12_DATABASE_URL)) throw new Error('Refusing to touch a non-F12 database.');
const { createRequire } = require('node:module');
const apiRequire = createRequire(`${process.env.F12_API_MODULES_DIR}/package.json`);
const { randomUUID, createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { Client } = apiRequire('pg');
const seed = require(process.env.F12_SEED_PATH);
const results = [];
const check = (name, fn) =>
  fn().then(
    () => results.push({ name, status: 'PASS' }),
    (error) =>
      results.push({
        name,
        status: 'FAIL',
        detail: String(error.message).split('\n')[0],
        ...(error.actual === undefined ? {} : { actual: error.actual, expected: error.expected }),
      }),
  );
const url = (path) => new URL(path, origin).href;
const FAKE_TEXT = [/Green Valley Farm/, /Dr\. Arshad/, /Storm approaching/, /High-risk cotton disease/];

(async () => {
  const db = new Client({ connectionString: process.env.F12_DATABASE_URL });
  await db.connect();
  const browser = await chromium.launch({ headless: true });
  const open = async (who, viewport) => {
    const context = await browser.newContext(viewport ? { viewport } : {});
    await context.addCookies([{ name: 'fg_access', value: seed[who].token, url: origin.href, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(url('/alerts'));
    return { context, page };
  };
  const inbox = (page) => page.locator('section[aria-labelledby="inbox-heading"]');
  const badge = (page) => page.getByTestId('notification-badge');
  const bellLabel = (page) => page.locator('a[aria-label^="View notifications"]').first().getAttribute('aria-label');
  const insert = async (user, title, category, ageMinutes, read, deliveryStatus) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO notifications(id,user_id,category,title,body,read_at,created_at) VALUES($1,$2,$3,$4,$5,$6,now()-make_interval(mins=>$7))`,
      [id, user, category, title, `FIXTURE body for ${title}`, read ? new Date() : null, ageMinutes],
    );
    if (deliveryStatus) {
      const tokenId = randomUUID();
      const token = `${randomUUID()}-${randomUUID()}`;
      await db.query(
        `INSERT INTO device_tokens(id,user_id,token_value,token_hash,platform,last_seen_at,active) VALUES($1,$2,$3,$4,'ANDROID',now(),true)`,
        [tokenId, user, token, createHash('sha256').update(token).digest('hex')],
      );
      await db.query(
        `INSERT INTO notification_deliveries(notification_id,device_token_id,status,scheduled_at) VALUES($1,$2,$3,now())`,
        [id, tokenId, deliveryStatus],
      );
    }
    return id;
  };
  const unreadInDb = async (user) => (await db.query('SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [user])).rows[0].n;
  try {
    await check('unauthenticated page redirects to login and every notification BFF route returns 401', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url('/alerts'));
      assert.match(page.url(), /\/login/);
      for (const path of ['/api/notifications', '/api/notifications/unread-count', '/api/notifications/preferences'])
        assert.equal((await context.request.get(url(path))).status(), 401, path);
      const post = await context.request.post(url('/api/notifications/read-all'), { data: {}, headers: { origin: origin.origin } });
      assert.equal(post.status(), 401);
      await context.close();
    });

    const a = await open('a');
    const pageA = a.page;

    await check('empty state is honest: no fake alerts, no badge, "No notifications yet"', async () => {
      await inbox(pageA).getByText('No notifications yet').waitFor({ timeout: 20000 });
      const body = await pageA.locator('body').innerText();
      for (const fake of FAKE_TEXT) assert.doesNotMatch(body, fake);
      assert.equal(await badge(pageA).count(), 0);
      assert.match(await bellLabel(pageA), /No unread notifications/);
    });

    const ids = {};
    await check('real notifications appear newest-first for the owner only, with an honest delivery line', async () => {
      ids.weather = await insert(seed.a.user, 'FIXTURE Weather check', 'WEATHER', 5, false, 'SENT');
      ids.task = await insert(seed.a.user, 'FIXTURE Task due', 'TASK', 10, false, 'FAILED');
      ids.expert = await insert(seed.a.user, 'FIXTURE Expert reply', 'EXPERT', 20, true, null);
      ids.other = await insert(seed.b.user, 'FIXTURE Belongs to B', 'SYSTEM', 1, false, 'SENT');
      await pageA.reload();
      const cards = inbox(pageA).locator('ul[aria-label="Notifications"] > li');
      await cards.first().waitFor({ timeout: 15000 });
      assert.equal(await cards.count(), 3);
      const titles = await cards.locator('h3').allInnerTexts();
      assert.deepEqual(titles.map((t) => t.replace('●', '').trim()), ['FIXTURE Weather check', 'FIXTURE Task due', 'FIXTURE Expert reply']);
      assert.doesNotMatch(await pageA.locator('body').innerText(), /Belongs to B/);
      const text = await inbox(pageA).innerText();
      assert.match(text, /Push sent \(delivery not confirmed\)/);
      assert.match(text, /Push could not be delivered/);
      assert.match(text, /In the app only/);
      assert.doesNotMatch(text, /Delivered to your device/);
      for (const fake of FAKE_TEXT) assert.doesNotMatch(await pageA.locator('body').innerText(), fake);
    });

    await check('the bell shows the real unread count (2) and announces it', async () => {
      await badge(pageA).waitFor({ timeout: 15000 });
      assert.equal((await badge(pageA).innerText()).trim(), '2');
      assert.match(await bellLabel(pageA), /2 unread notifications/);
    });

    await check('filters: Unread shows 2, a category filter narrows the list', async () => {
      await inbox(pageA).getByRole('button', { name: 'Unread', exact: true }).click();
      assert.equal(await inbox(pageA).locator('ul[aria-label="Notifications"] > li').count(), 2);
      await inbox(pageA).getByRole('button', { name: 'All', exact: true }).click();
      await inbox(pageA).getByLabel('Category').selectOption('TASK');
      assert.equal(await inbox(pageA).locator('ul[aria-label="Notifications"] > li').count(), 1);
      await inbox(pageA).getByLabel('Category').selectOption('SATELLITE');
      await inbox(pageA).getByText('No matching notifications').waitFor();
      await inbox(pageA).getByLabel('Category').selectOption('ALL');
    });

    await check('marking one as read updates the database, the card and the bell; reload keeps it', async () => {
      await inbox(pageA).getByRole('button', { name: 'Mark as read' }).first().click();
      await pageA.waitForFunction(() => document.querySelector('[data-testid="notification-badge"]')?.textContent?.trim() === '1', null, { timeout: 15000 });
      assert.equal(await unreadInDb(seed.a.user), 1);
      await pageA.reload();
      await badge(pageA).waitFor({ timeout: 15000 });
      assert.equal((await badge(pageA).innerText()).trim(), '1');
    });

    await check('farmer B cannot read, mark or bulk-mark farmer A notifications through the BFF', async () => {
      const b = await open('b');
      const cross = await b.context.request.patch(url(`/api/notifications/${ids.task}/read`), { headers: { origin: origin.origin } });
      assert.equal(cross.status(), 404);
      const bulk = await b.context.request.post(url('/api/notifications/read-all'), { data: {}, headers: { origin: origin.origin } });
      assert.equal(bulk.status(), 200);
      assert.equal(await unreadInDb(seed.a.user), 1, 'A unread count unchanged by B');
      const own = await (await b.context.request.get(url('/api/notifications'))).json();
      assert.equal(own.length, 1);
      assert.equal(own[0].title, 'FIXTURE Belongs to B');
      await b.context.close();
    });

    await check('cross-origin mutations and malformed requests are rejected', async () => {
      const evil = await pageA.context().request.post(url('/api/notifications/read-all'), { data: {}, headers: { origin: 'https://evil.example' } });
      assert.equal(evil.status(), 403);
      assert.equal((await pageA.context().request.patch(url('/api/notifications/not-a-uuid/read'), { headers: { origin: origin.origin } })).status(), 404);
      assert.equal((await pageA.context().request.get(url('/api/notifications?limit=abc'))).status(), 400);
      assert.equal((await pageA.context().request.get(url('/api/notifications?unreadOnly=maybe'))).status(), 400);
      const bad = await pageA.context().request.put(url('/api/notifications/preferences/TASK'), { data: { pushEnabled: true, admin: true }, headers: { origin: origin.origin } });
      assert.equal(bad.status(), 400);
    });

    await check('settings: push toggle and quiet hours are saved to PostgreSQL and survive a reload; invalid input is refused', async () => {
      await inbox(pageA).locator('details summary').click();
      const weather = inbox(pageA).locator('fieldset', { hasText: 'Weather' }).first();
      await weather.getByRole('checkbox', { name: 'Push' }).uncheck();
      await weather.locator('input[type="time"]').nth(0).fill('22:00');
      await weather.locator('input[type="time"]').nth(1).fill('06:00');
      await weather.getByRole('button', { name: /^Save Weather/ }).click();
      await weather.getByText('Weather settings saved.').waitFor({ timeout: 10000 });
      const row = (await db.query("SELECT push_enabled, to_char(quiet_hours_start,'HH24:MI') s, to_char(quiet_hours_end,'HH24:MI') e FROM notification_preferences WHERE user_id=$1 AND category='WEATHER'", [seed.a.user])).rows[0];
      assert.deepEqual(row, { push_enabled: false, s: '22:00', e: '06:00' });
      await pageA.reload();
      await inbox(pageA).locator('details summary').click();
      const again = inbox(pageA).locator('fieldset', { hasText: 'Weather' }).first();
      await again.getByRole('checkbox', { name: 'Push' }).waitFor();
      assert.equal(await again.getByRole('checkbox', { name: 'Push' }).isChecked(), false);
      assert.equal(await again.locator('input[type="time"]').nth(0).inputValue(), '22:00');
      // Only a start time must not be saved.
      const task = inbox(pageA).locator('fieldset', { hasText: 'Task' }).first();
      await task.locator('input[type="time"]').nth(0).fill('21:00');
      await task.getByRole('button', { name: /^Save Task/ }).click();
      await task.getByText('Set both a start and an end time, or clear both.').waitFor();
      assert.equal((await db.query("SELECT 1 FROM notification_preferences WHERE user_id=$1 AND category='TASK'", [seed.a.user])).rows.length, 0);
    });

    await check('without notification consent the settings explain why push is off', async () => {
      const b = await open('b');
      await inbox(b.page).locator('details summary').click();
      await b.page.getByText(/Push notifications are off because you have not agreed/).waitFor({ timeout: 15000 });
      await b.context.close();
    });

    await check('a refresh outage keeps the last list labelled out of date and never shows it as empty; Retry recovers', async () => {
      await pageA.reload();
      const cards = inbox(pageA).locator('ul[aria-label="Notifications"] > li');
      await cards.first().waitFor({ timeout: 15000 });
      const before = await cards.count();
      await pageA.route('**/api/notifications', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Service unavailable.' } }) }));
      // Mark all read succeeds, then its follow-up list refresh fails.
      await inbox(pageA).getByRole('button', { name: 'Mark all as read' }).click();
      await inbox(pageA).getByRole('alert').filter({ hasText: 'may be out of date' }).waitFor({ timeout: 15000 });
      assert.equal(await cards.count(), before);
      assert.equal(await inbox(pageA).getByText('No notifications yet').count(), 0);
      await pageA.unroute('**/api/notifications');
      await pageA.getByRole('button', { name: 'Retry' }).click();
      await inbox(pageA).getByRole('alert').filter({ hasText: 'may be out of date' }).waitFor({ state: 'detached', timeout: 15000 });
      assert.equal(await cards.count(), before);
    });

    await check('malformed list body is an error, not an empty inbox', async () => {
      await pageA.route('**/api/notifications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"records":[]}' }));
      await pageA.reload();
      await inbox(pageA).getByRole('alert').filter({ hasText: 'was not understood' }).waitFor({ timeout: 15000 });
      assert.equal(await inbox(pageA).getByText('No notifications yet').count(), 0);
      await pageA.getByRole('button', { name: 'Retry' }).waitFor();
      await pageA.unroute('**/api/notifications');
      await pageA.getByRole('button', { name: 'Retry' }).click();
      await inbox(pageA).locator('ul[aria-label="Notifications"] > li').first().waitFor({ timeout: 15000 });
    });

    await check('a failed first load shows an error with Retry that recovers once the API is back', async () => {
      await pageA.route('**/api/notifications', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporarily down.' } }) }));
      await pageA.reload();
      await inbox(pageA).getByRole('alert').filter({ hasText: 'Temporarily down.' }).waitFor({ timeout: 15000 });
      assert.equal(await inbox(pageA).getByText('No notifications yet').count(), 0);
      await pageA.unroute('**/api/notifications');
      await pageA.getByRole('button', { name: 'Retry' }).click();
      await inbox(pageA).locator('ul[aria-label="Notifications"] > li').first().waitFor({ timeout: 15000 });
    });

    await check('an unread-count outage shows no badge and says the count is unavailable', async () => {
      await pageA.route('**/api/notifications/unread-count', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await pageA.reload();
      await pageA.waitForFunction(() => document.querySelector('a[aria-label^="View notifications"]')?.getAttribute('aria-label')?.includes('unavailable'), null, { timeout: 15000 });
      assert.equal(await badge(pageA).count(), 0);
      await pageA.unroute('**/api/notifications/unread-count');
    });

    await check('mark all as read clears the badge and only the caller rows change', async () => {
      await insert(seed.a.user, 'FIXTURE Fresh unread', 'WEATHER', 0, false, null);
      await pageA.reload();
      await badge(pageA).waitFor({ timeout: 15000 });
      await inbox(pageA).getByRole('button', { name: 'Mark all as read' }).waitFor();
      await insert(seed.b.user, 'FIXTURE B second', 'SYSTEM', 0, false, null);
      const bBefore = await unreadInDb(seed.b.user);
      assert.ok(bBefore >= 1);
      await inbox(pageA).getByRole('button', { name: 'Mark all as read' }).click();
      await pageA.waitForFunction(() => !document.querySelector('[data-testid="notification-badge"]'), null, { timeout: 15000 });
      assert.equal(await unreadInDb(seed.a.user), 0);
      assert.equal(await unreadInDb(seed.b.user), bBefore, "B's notifications are untouched by A's mark-all");
      assert.match(await bellLabel(pageA), /No unread notifications/);
    });

    await check('mobile viewport (375px): no horizontal overflow; a keyboard user can reach Mark as read', async () => {
      await insert(seed.a.user, 'FIXTURE Keyboard check', 'SYSTEM', 0, false, null);
      const m = await open('a', { width: 375, height: 667 });
      await inbox(m.page).getByRole('heading', { name: /FIXTURE Keyboard check/ }).waitFor({ timeout: 15000 });
      const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `overflow ${overflow}px`);
      const target = inbox(m.page).getByRole('button', { name: 'Mark as read' }).first();
      await target.focus();
      assert.equal(await m.page.evaluate(() => document.activeElement?.textContent), 'Mark as read');
      await m.page.keyboard.press('Enter');
      await m.page.waitForFunction(() => !document.querySelector('[data-testid="notification-badge"]'), null, { timeout: 15000 });
      assert.equal(await unreadInDb(seed.a.user), 0);
      await m.context.close();
    });

    await check('a revoked session shows "session has ended" and never leaves the old list on screen', async () => {
      const r = await open('a');
      await inbox(r.page).locator('ul[aria-label="Notifications"] > li').first().waitFor({ timeout: 15000 });
      await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [seed.a.sid]);
      await r.page.reload();
      // The proxy sends a revoked session to the login page; a client-side 401 shows the message instead.
      const onLogin = /\/login/.test(r.page.url());
      if (!onLogin) {
        await inbox(r.page).getByRole('alert').filter({ hasText: 'session has ended' }).waitFor({ timeout: 15000 });
        assert.equal(await inbox(r.page).locator('ul[aria-label="Notifications"] > li').count(), 0);
      }
      await r.context.close();
    });
  } finally {
    await browser.close();
    await db.end();
  }
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(JSON.stringify({ status: failed.length ? 'RUN_FAIL' : 'RUN_PASS', passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.error('RUN_FAIL', error.message);
  process.exitCode = 1;
});
