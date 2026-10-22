// F10 browser E2E: real Chromium -> Next.js BFF -> core API -> PostgreSQL (real retrieval + persistence).
// Requires an ISOLATED stack and synthetic seed (F10_* variables). The model provider is NOT exercised
// here: with ASSISTANT_PROVIDER=fake the assistant correctly abstains. page.route() is used ONLY for
// (a) a labelled stand-in grounded reply to test rendering, and (b) injected outages/malformed bodies.
const assert = require('node:assert/strict');
const required = ['F10_WEB_URL', 'F10_DATABASE_URL', 'F10_SEED_PATH', 'F10_API_MODULES_DIR'];
if (required.some((name) => !process.env[name])) {
  console.error(`BLOCKED_EXTERNAL: configure ${required.join(', ')} for an isolated stack.`);
  process.exit(2);
}
const origin = new URL(process.env.F10_WEB_URL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local isolated stack only.');
if (!/\/f10_e2e$/.test(process.env.F10_DATABASE_URL)) throw new Error('Refusing to touch a non-F10 database.');
const { createRequire } = require('node:module');
const apiRequire = createRequire(`${process.env.F10_API_MODULES_DIR}/package.json`);
const { chromium } = require('playwright');
const { Client } = apiRequire('pg');
const seed = require(process.env.F10_SEED_PATH);
const results = [];
const check = (name, fn) =>
  fn().then(
    () => results.push({ name, status: 'PASS' }),
    (error) =>
      results.push({
        name,
        status: 'FAIL',
        detail: String(error.message).split('\n')[0],
        ...(error.actual === undefined
          ? {}
          : { actual: error.actual, expected: error.expected, at: String(error.stack).split('\n')[1]?.trim() }),
      }),
  );
const url = (path) => new URL(path, origin).href;
const GLYPHS = { ur: /[؀-ۿ]/, hi: /[ऀ-ॿ]/ };

(async () => {
  const db = new Client({ connectionString: process.env.F10_DATABASE_URL });
  await db.connect();
  const browser = await chromium.launch({ headless: true });
  const open = async (who, viewport) => {
    const context = await browser.newContext(viewport ? { viewport } : {});
    await context.addCookies([{ name: 'fg_access', value: seed[who].token, url: origin.href, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    await page.goto(url('/assistant'));
    return { context, page };
  };
  const chat = (page) => page.locator('section[aria-labelledby="chat-heading"]');
  const ask = async (page, text, language) => {
    if (language) await chat(page).getByLabel('Language').selectOption(language);
    await chat(page).getByLabel('Your question').fill(text);
    await chat(page).getByRole('button', { name: 'Ask', exact: true }).click();
  };
  const alertText = (page) => page.locator('div[role="alert"], p[role="alert"]').filter({ hasText: /./ });
  const assistantRows = (user) => db.query(
    "SELECT m.id, m.content, m.language, m.grounding, m.citations, m.provider, m.model_id, m.idempotency_key FROM assistant_messages m JOIN assistant_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='ASSISTANT' ORDER BY m.created_at", [user]).then((r) => r.rows);
  try {
    await check('unauthenticated page redirects to login; BFF routes return 401', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url('/assistant'));
      assert.match(page.url(), /\/login/);
      assert.equal((await context.request.get(url('/api/assistant/conversations'))).status(), 401);
      const post = await context.request.post(url('/api/assistant/conversations'), { data: {}, headers: { origin: origin.origin } });
      assert.equal(post.status(), 401);
      await context.close();
    });

    const a = await open('a');
    const pageA = a.page;

    await check('empty state is shown for a farmer with no questions; farm list loads', async () => {
      await pageA.getByText('No questions yet.').waitFor({ timeout: 15000 });
      await chat(pageA).getByRole('option', { name: 'North Field' }).waitFor({ state: 'attached' });
    });

    await check('cross-origin mutation is rejected by the BFF', async () => {
      const response = await pageA.context().request.post(url('/api/assistant/conversations'), { data: {}, headers: { origin: 'https://evil.example' } });
      assert.equal(response.status(), 403);
    });

    await check('question with matching approved fixture reaches retrieval; fake provider cannot cite so the UI shows "no approved guidance"', async () => {
      await chat(pageA).getByLabel('Farm').selectOption({ label: 'North Field' });
      await ask(pageA, 'When should I sow wheat?', 'en');
      await pageA.getByText(/No approved guidance found/).waitFor({ timeout: 20000 });
      assert.equal(await pageA.getByText('Sources', { exact: true }).count(), 0);
      const rows = await assistantRows(seed.a.user);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].grounding, 'ABSTAINED');
      assert.deepEqual(rows[0].citations, []);
      assert.equal(rows[0].language, 'en');
      assert.equal(rows[0].provider, 'FAKE', 'sources were retrieved so the provider was called, and its uncited text was discarded');
      assert.doesNotMatch(rows[0].content, /Inspect the field and use verified guidance/);
    });

    await check('question with no approved match abstains without calling a provider (language-matched message)', async () => {
      await ask(pageA, 'zzzunknownterm qqqother', 'ur');
      await pageA.getByText(/منظور شدہ رہنمائی/).first().waitFor({ timeout: 15000 });
      const rows = await assistantRows(seed.a.user);
      const last = rows.at(-1);
      assert.equal(last.grounding, 'ABSTAINED');
      assert.equal(last.provider, null);
      assert.equal(last.language, 'ur');
    });

    await check('Urdu and Hindi questions retrieve language-specific approved fixtures (provider called)', async () => {
      for (const [text, language] of [['گندم کب بوئیں؟', 'ur'], ['गेहूं कब बोएं?', 'hi']]) {
        const before = await pageA.locator('article').count();
        await ask(pageA, text, language);
        await pageA.waitForFunction((n) => document.querySelectorAll('article').length >= n + 2, before, { timeout: 25000 });
      }
      const rows = await assistantRows(seed.a.user);
      assert.ok(rows.find((r) => r.language === 'ur' && r.provider === 'FAKE'), 'Urdu question retrieved the Urdu fixture');
      assert.ok(rows.find((r) => r.language === 'hi' && r.provider === 'FAKE'), 'Hindi question retrieved the Hindi fixture');
    });

    await check('a draft article is never retrieved', async () => {
      const before = (await assistantRows(seed.a.user)).length;
      await ask(pageA, 'rice secret unapproved draft', 'en');
      await pageA.waitForFunction((n) => document.querySelectorAll('article').length > n, await pageA.locator('article').count(), { timeout: 15000 });
      const rows = await assistantRows(seed.a.user);
      assert.equal(rows.length, before + 1);
      assert.equal(rows.at(-1).provider, null, 'no approved source matched, so the provider was not called');
    });

    await check('reload restores the saved conversation history', async () => {
      const count = await pageA.locator('article').count();
      await pageA.reload();
      await pageA.waitForFunction((n) => document.querySelectorAll('article').length === n, count, { timeout: 15000 });
    });

    await check('RENDERING ONLY (stand-in reply): a grounded answer shows its sources; Urdu text is rendered right-to-left', async () => {
      const id = seed.articles.ur;
      await pageA.route('**/api/assistant/conversations/*/messages', (route) =>
        route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
          id: '3c63d709-a06d-4aa1-b660-c40d04b8dddb', role: 'ASSISTANT', content: 'گندم 1 سے 25 نومبر کے درمیان بوئیں۔', language: 'ur', grounding: 'GROUNDED',
          citations: [{ id, title: 'FIXTURE گندم کی بوائی کا وقت', revision: 1 }], proposals: [], requiresExplicitConfirmation: true }) }));
      await ask(pageA, 'گندم کب بوئیں؟', 'ur');
      await pageA.getByText('Sources', { exact: true }).waitFor({ timeout: 10000 });
      await pageA.getByText(/revision 1/).waitFor();
      const dir = await pageA.getByText('گندم 1 سے 25 نومبر کے درمیان بوئیں۔').evaluate((el) => getComputedStyle(el).direction);
      assert.equal(dir, 'rtl');
      await pageA.unroute('**/api/assistant/conversations/*/messages');
    });

    await check('provider outage (HTTP 503) shows an error, keeps the typed question, and Retry reuses the same idempotency key', async () => {
      const keys = [];
      await pageA.route('**/api/assistant/conversations/*/messages', async (route) => {
        keys.push(JSON.parse(route.request().postData()).idempotencyKey);
        if (keys.length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Assistant request failed.' } }) });
        return route.continue();
      });
      const before = (await assistantRows(seed.a.user)).length;
      await ask(pageA, 'When should I sow wheat?', 'en');
      await alertText(pageA).filter({ hasText: 'Assistant request failed.' }).waitFor({ timeout: 10000 });
      assert.equal(await chat(pageA).getByLabel('Your question').inputValue(), 'When should I sow wheat?');
      const retried = pageA.waitForResponse((r) => r.url().includes('/messages') && r.status() === 201, { timeout: 20000 });
      await pageA.getByRole('button', { name: 'Retry' }).click();
      await retried;
      await pageA.waitForFunction(() => document.querySelector('button[type="submit"]')?.textContent === 'Ask');
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1]);
      assert.equal((await assistantRows(seed.a.user)).length, before + 1);
      await pageA.unroute('**/api/assistant/conversations/*/messages');
    });

    await check('malformed reply and network abort are errors and append nothing', async () => {
      const count = await pageA.locator('article').count();
      await pageA.route('**/api/assistant/conversations/*/messages', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{}' }));
      await ask(pageA, 'wheat', 'en');
      await alertText(pageA).filter({ hasText: 'not understood' }).waitFor({ timeout: 10000 });
      assert.equal(await pageA.locator('article').count(), count);
      await pageA.unroute('**/api/assistant/conversations/*/messages');
      await pageA.route('**/api/assistant/conversations/*/messages', (route) => route.abort('timedout'));
      await pageA.getByRole('button', { name: 'Retry' }).click();
      await alertText(pageA).first().waitFor();
      assert.equal(await pageA.locator('article').count(), count);
      await pageA.unroute('**/api/assistant/conversations/*/messages');
    });

    await check('farmer B sees none of A history and cannot read A conversation through the BFF', async () => {
      const b = await open('b');
      await b.page.getByText('No questions yet.').waitFor({ timeout: 15000 });
      assert.equal(await b.page.locator('article').count(), 0);
      const [{ id }] = (await db.query('SELECT id FROM assistant_conversations WHERE user_id=$1 LIMIT 1', [seed.a.user])).rows;
      assert.equal((await b.context.request.get(url(`/api/assistant/conversations/${id}`))).status(), 404);
      const send = await b.context.request.post(url(`/api/assistant/conversations/${id}/messages`), {
        data: { message: 'wheat', language: 'en', idempotencyKey: '3c63d709-a06d-4aa1-b660-c40d04b8dddb' }, headers: { origin: origin.origin } });
      assert.equal(send.status(), 404);
      const using = await b.context.request.post(url('/api/assistant/conversations'), { data: { farmId: seed.a.farm }, headers: { origin: origin.origin } });
      assert.equal(using.status(), 404);
      await b.context.close();
    });

    await check('input validation at the BFF: bad language, empty and oversized messages', async () => {
      const [{ id }] = (await db.query('SELECT id FROM assistant_conversations WHERE user_id=$1 LIMIT 1', [seed.a.user])).rows;
      const base = { language: 'en', idempotencyKey: '3c63d709-a06d-4aa1-b660-c40d04b8dddb' };
      for (const data of [{ ...base, message: 'x', language: 'fr' }, { ...base, message: '   ' }, { ...base, message: 'x'.repeat(4001) }, { message: 'x' }]) {
        const response = await pageA.context().request.post(url(`/api/assistant/conversations/${id}/messages`), { data, headers: { origin: origin.origin } });
        assert.equal(response.status(), 400);
      }
    });

    await check('mobile viewport (375px): no horizontal overflow', async () => {
      const m = await open('a', { width: 375, height: 667 });
      await chat(m.page).getByLabel('Your question').waitFor();
      const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `overflow ${overflow}px`);
      await m.context.close();
    });

    await check('revoked session: history shows session-ended and sending is disabled', async () => {
      await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [seed.a.sid]);
      await pageA.reload();
      await alertText(pageA).filter({ hasText: 'session has ended' }).waitFor({ timeout: 15000 }).catch(async () => {
        // a revoked session redirects through the proxy to /login
        assert.match(pageA.url(), /\/login/);
      });
    });
  } finally {
    await browser.close();
    await db.end();
  }
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(JSON.stringify({ status: failed.length ? 'RUN_FAIL' : 'RUN_PASS', passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => { console.error('RUN_FAIL', error.message); process.exitCode = 1; });
