const { chromium, OUT, open } = require('./lib.cjs');
const PIN = '4826';
async function shot(page, o) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250); return page.screenshot(o); }
const MOCK = process.env.MOCK === '1';
const PFX = MOCK ? 'mock-' : '';
const RID = '3c63d709-a06d-4aa1-b660-c40d04b8dddb';
async function installMock(page) {
  let step = 0; let saved = false;
  await page.route('**/api/ussd-demo/session', async (route) => {
    const body = route.request().postDataJSON();
    const J = (...l) => l.join(String.fromCharCode(10));
    const texts = [J('CON Enter your Fasal Guard PIN', '0. Cancel'), J('CON Select farm', '1. Golden rice', '0. Cancel'), J('CON Select crop season', '1. Rice - 2026-09-01', '0. Cancel'), J('CON Select expense category', '1. Seed', '2. Fertilizer', '3. Labour', '0. Cancel'), J('CON Enter whole PKR amount', '0. Cancel'), J('CON Expense date', '1. Today', '0. Cancel'), J('CON Review expense', 'Farm: Golden rice', 'Season: Rice - 2026-09-01', 'Category: Seed', 'Amount: PKR 1234', 'Date: 2026-10-16', '1. Confirm', '2. Cancel'), 'END Expense saved. Receipt ' + RID];
    const text = texts[Math.min(step, texts.length - 1)]; step += 1; if (step === 8) saved = true;
    await new Promise((r) => setTimeout(r, 350));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
  });
  await page.route('**/api/farm-ledger', async (route) => {
    const rows = saved ? [{ id: RID, amountMinor: '123400', currency: 'PKR', channel: 'USSD', farmName: 'Golden rice', category: 'Seed', occurredOn: '2026-10-16' }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
}
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(ok ? 'PASS' : 'FAIL', n, d); };
const keyRe = (k) => new RegExp('^' + ({ '*': 'star', '#': 'hash' }[k] || k) + '(,|$)');
async function dial(page, code) { for (const k of code) await page.getByRole('button', { name: keyRe(k) }).click(); }
const text = (page) => page.locator('pre[role=status]').innerText();
async function reply(page, digits) {
  const prev = await text(page);
  await dial(page, digits);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.waitForFunction((t) => { const e = document.querySelector('pre[role=status]'); return e && e.textContent !== t && e.textContent !== 'Connecting…'; }, prev, { timeout: 20000 });
  await page.waitForTimeout(500);
  return text(page);
}
async function consent(page) {
  await page.getByLabel('I understand this is a simulation.').check();
  await page.getByRole('button', { name: 'Continue to dialer' }).click();
}
(async () => {
  const browser = await chromium.launch();
  { const { ctx, page } = await open(browser, 360, 740);
    const m = async () => page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    let sw = await m(); rec('no horizontal scroll at 360 (consent)', sw[0] <= sw[1], sw.join('/'));
    await consent(page); await dial(page, '*3275#');
    sw = await m(); rec('no horizontal scroll at 360 (typed)', sw[0] <= sw[1], sw.join('/'));
    const small = await page.evaluate(() => [...document.querySelectorAll('.fg-phone button, .fg-phone [role=textbox]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5) && b.getAttribute('role') !== 'textbox'; }).map((b) => b.getAttribute('aria-label') || b.textContent));
    rec('dialer targets >= 44px at 360', small.length === 0, small.join(','));
    await ctx.close(); }
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    const { ctx, page } = await open(browser, w, h);
    if (MOCK) await installMock(page);
    await shot(page, { path: `${OUT}/${PFX}01-consent-${w}.png` });
    rec(`Continue disabled until consent (${w})`, await page.getByRole('button', { name: 'Continue to dialer' }).isDisabled());
    await consent(page);
    await page.waitForTimeout(300);
    await shot(page, { path: `${OUT}/${PFX}02-idle-${w}.png` });
    await dial(page, '*3275');
    await shot(page, { path: `${OUT}/${PFX}03-typed-${w}.png` });
    if (w === 390) {
      await page.keyboard.press('#');
      rec('keyboard types #', (await page.getByTestId('dialed').innerText()).trim() === '*3275#');
      await page.keyboard.press('Backspace');
      rec('keyboard Backspace', (await page.getByTestId('dialed').innerText()).trim() === '*3275');
      let bb = await page.getByRole('button', { name: /Delete last digit/ }).boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
      rec('long-press backspace clears', (await page.getByTestId('dialed').innerText()).trim() === '');
      await dial(page, '*786#'); await page.getByRole('button', { name: 'Call' }).click();
      await page.waitForSelector('pre[role=status]');
      const t = await text(page);
      rec('*786# -> invalid MMI code message', /invalid MMI code/.test(t) && t.includes('*3275#'), t);
      await shot(page, { path: `${OUT}/${PFX}04-wrong-code-390.png` });
      await page.getByRole('button', { name: 'OK' }).click();
      bb = await page.getByRole('button', { name: /Delete last digit/ }).boundingBox();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
    }
    // PIN card (real UI) then the real end-to-end expense, at every viewport
    await page.locator('#current-password').scrollIntoViewIfNeeded();
    if (w === 390) {
      await page.locator('#current-password').fill('Ussd-QA-Redesign-2026!x');
      await page.locator('#new-pin').fill(PIN); await page.locator('#confirm-pin').fill(PIN);
    }
    await page.screenshot({ path: `${OUT}/${PFX}05-pin-card-${w}.png` });
    if (w === 390) {
      await page.getByRole('button', { name: 'Save PIN' }).click();
      await page.locator('form p[role=status]').first().waitFor();
      rec('PIN card result', true, await page.locator('form p[role=status]').first().innerText());
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (w !== 390) { const bb = await page.getByRole('button', { name: /Delete last digit/ }).boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); }
    await dial(page, '*3275#'); await page.getByRole('button', { name: 'Call' }).click();
    if (!MOCK) {
      await page.waitForFunction(() => document.querySelector('.fg-dialog [role=alert]'), null, { timeout: 20000 });
      rec(`real backend response shown (${w})`, true, (await page.locator('.fg-dialog').innerText()).split(String.fromCharCode(10)).join(' | '));
      await shot(page, { path: `${OUT}/${PFX}10-backend-error-${w}.png` });
      await ctx.close(); continue;
    }
    await page.waitForFunction(() => /PIN/.test(document.querySelector('pre[role=status]')?.textContent ?? ''), null, { timeout: 20000 });
    rec(`dial *3275# opens session (${w})`, true, (await text(page)).split(String.fromCharCode(10)).join(' | '));
    let s = await reply(page, PIN);
    await shot(page, { path: `${OUT}/${PFX}06-menu-${w}.png` });
    console.log('--- after PIN:' + s);
    for (const label of ['farm', 'season', 'category']) { s = await reply(page, '1'); console.log('--- after ' + label + ': ' + s); }
    s = await reply(page, '1234'); console.log('--- after amount:' + s);
    s = await reply(page, '1'); console.log('--- after date:' + s);
    await shot(page, { path: `${OUT}/${PFX}07-review-${w}.png` });
    s = await reply(page, '1'); console.log('--- after confirm:' + s);
    await page.waitForTimeout(2500);
    const dlg = (await page.locator('.fg-dialog').innerText()).split(String.fromCharCode(10)).join(' | ');
    rec(`receipt verified against ledger (${w})`, /Saved and verified/.test(dlg), dlg);
    await shot(page, { path: `${OUT}/${PFX}08-receipt-${w}.png` });
    await page.getByRole('button', { name: 'OK' }).click();
    await page.locator('#ledger-heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${PFX}09-ledger-${w}.png` });
    await ctx.close();
  }
  console.log(JSON.stringify(results.filter((r) => !r.ok)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
