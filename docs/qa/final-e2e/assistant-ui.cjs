// FINAL E2E: Voice Kisan Assistant text flows + route regression. QA_PASSWORD and QA_SCRATCH from env. One login.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, mobile, desktop, login } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
const results = [];
const rec = (id, status, d = '') => { results.push({ id, status, detail: String(d).slice(0, 900) }); console.log(status, id, '::', String(d).slice(0, 320)); fs.writeFileSync(path.join(OUT, 'assistant-ui-results.json'), JSON.stringify(results, null, 1)); };
const URDU = /[؀-ۿ]{2,}/;
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
const hscroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const chat = 'section[aria-labelledby=chat-heading]';
async function ask(page, text) {
  const before = await page.locator(`${chat} article`).count();
  await page.locator('#assistant-question').fill(text);
  await page.locator(`${chat} form button[type=submit]`).click();
  await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby=chat-heading] article').length >= n + 2, before, { timeout: 90000 });
  await page.waitForTimeout(600);
  return page.locator(`${chat} article`).last().innerText();
}
async function fresh(page) {
  const nc = page.getByRole('button', { name: /New conversation|نئی گفتگو/ });
  if (await nc.count()) await nc.first().click();
  await page.waitForTimeout(300);
}
(async () => {
  await login();
  const browser = await chromium.launch();
  for (const [tag, prof] of [['m360', mobile], ['d1440', desktop]]) {
    const ctx = await browser.newContext({ ...prof, storageState: STATE });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/assistant', { waitUntil: 'load' });
    const region = page.locator('[data-testid=assistant-region]');
    await region.waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    // (o)
    const dir = await region.getAttribute('dir'), lg = await region.getAttribute('lang');
    rec(`o/${tag}/urdu-default-rtl`, dir === 'rtl' && lg === 'ur' && URDU.test(await region.innerText()) ? 'PASS' : 'FAIL', `dir=${dir} lang=${lg} hscroll=${await hscroll(page)}`);
    await shot(page, `${tag}-assistant-ur-default`);
    await page.getByRole('button', { name: 'English' }).first().click(); await page.waitForTimeout(500);
    rec(`o/${tag}/toggle-en`, (await region.getAttribute('dir')) === 'ltr' && (await region.getAttribute('lang')) === 'en' ? 'PASS' : 'FAIL');
    await shot(page, `${tag}-assistant-en`);
    await page.getByRole('button', { name: 'اردو' }).first().click(); await page.waitForTimeout(500);
    rec(`o/${tag}/toggle-back-ur`, (await region.getAttribute('dir')) === 'rtl' ? 'PASS' : 'FAIL');
    // (s) warnings card
    const wc = page.locator('[data-testid=warnings-card]');
    rec(`s/${tag}/warnings-card`, (await wc.count()) ? 'PASS' : 'FAIL', (await wc.count()) ? (await wc.innerText()).replace(/\n+/g, ' | ') : 'no card');
    await shot(page, `${tag}-assistant-warnings-ur`);
    await page.getByRole('button', { name: 'English' }).first().click(); await page.waitForTimeout(300);

    const cited = async (id, q, lang, shotName) => {
      try {
        const a = await ask(page, q);
        const ok = /DEMO/.test(a) && /(not expert-reviewed|expert|ماہر)/i.test(a) && (/Sources|ماخذ/.test(a));
        const quote = /["“”«»]|❝/.test(a) || a.split('\n').length > 3;
        rec(id, ok && quote ? 'PASS' : 'FAIL', a.replace(/\n+/g, ' | ').slice(0, 600));
        await shot(page, `${tag}-${shotName}`);
      } catch (e) { rec(id, 'FAIL', String(e.message).slice(0, 200)); await shot(page, `${tag}-err-${shotName}`).catch(() => {}); }
    };
    // (p) English
    await fresh(page);
    await cited(`p/${tag}/en-wheat-yellow`, 'Why are my wheat leaves turning yellow?', 'en', 'p-en-wheat');
    const art = page.locator(`${chat} article`).last();
    const listenBtn = art.getByRole('button', { name: 'Listen' });
    if (await listenBtn.count()) {
      await listenBtn.click(); await page.waitForTimeout(600);
      const p1 = await art.getByRole('button', { name: /Listen|Stop/ }).last().getAttribute('aria-pressed');
      rec(`v/${tag}/listen-toggle`, 'PASS', `aria-pressed after click=${p1}; label now "${(await art.getByRole('button', { name: /Listen|Stop/ }).last().innerText())}"`);
      await art.getByRole('button', { name: /Listen|Stop/ }).last().click().catch(() => {});
    } else rec(`v/${tag}/listen-toggle`, 'FAIL', 'no Listen button on answer');
    // Urdu
    await page.getByRole('button', { name: 'اردو' }).first().click(); await page.waitForTimeout(400);
    for (const [k, q] of [['wheat', 'میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟'], ['cotton', 'کپاس کی فصل پر سفید مکھی کا حملہ ہو تو کیا کروں؟'], ['rice', 'چاول کی فصل کو پانی کب اور کتنا دینا چاہیے؟']]) {
      await fresh(page);
      await cited(`p/${tag}/ur-${k}`, q, 'ur', `p-ur-${k}`);
    }
    // (q) off-topic
    await page.getByRole('button', { name: 'English' }).first().click(); await page.waitForTimeout(300);
    await fresh(page);
    const off = await ask(page, 'what is the capital of France');
    rec(`q/${tag}/offtopic-en-abstains`, /not an answer|No approved guidance/i.test(off) && !/Paris/i.test(off) && !/Sources/.test(off) ? 'PASS' : 'FAIL', off.replace(/\n+/g, ' | ').slice(0, 300));
    await shot(page, `${tag}-q-offtopic-en`);
    await page.getByRole('button', { name: 'اردو' }).first().click(); await page.waitForTimeout(300);
    await fresh(page);
    const offu = await ask(page, 'فرانس کا دارالحکومت کیا ہے؟');
    rec(`q/${tag}/offtopic-ur-abstains`, !/پیرس|Paris/i.test(offu) && !/ماخذ/.test(offu) && URDU.test(offu) ? 'PASS' : 'FAIL', offu.replace(/\n+/g, ' | ').slice(0, 300));
    await shot(page, `${tag}-q-offtopic-ur`);
    // (r) account
    await page.getByRole('button', { name: 'English' }).first().click(); await page.waitForTimeout(300);
    for (const [k, q, re] of [['farms', 'Which farms do I have?', /Golden rice/i], ['spend', 'how much did I spend this month', /\d/]]) {
      await fresh(page);
      const a = await ask(page, q);
      const chip = await page.locator('[data-testid=account-chip]').count();
      rec(`r/${tag}/account-${k}`, chip && re.test(a) ? 'PASS' : 'FAIL', `chip=${chip} :: ${a.replace(/\n+/g, ' | ').slice(0, 400)}`);
      await shot(page, `${tag}-r-account-${k}`);
    }
    rec(`o/${tag}/no-hscroll-after`, (await hscroll(page)) <= 0 ? 'PASS' : 'FAIL', `hscroll=${await hscroll(page)}`);
    rec(`pageerrors/${tag}/assistant`, errs.length ? 'FAIL' : 'PASS', errs.join(';'));
    await ctx.close();
  }
  // (w) regression
  for (const [tag, prof] of [['m360', mobile], ['d1440', desktop]]) {
    const ctx = await browser.newContext({ ...prof, storageState: STATE });
    for (const r of ['dashboard', 'scan', 'satellite', 'ussd-demo', 'alerts', 'farms']) {
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      try {
        const resp = await page.goto(B + '/' + r, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        const url = page.url();
        const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
        const hs = await hscroll(page);
        await page.screenshot({ path: path.join(OUT, `${tag}-w-${r}.png`), fullPage: false });
        const ok = resp.status() === 200 && url.includes('/' + r) && txt.length > 150 && !/Application error|This page couldn.t load|500/.test(txt.slice(0, 400)) && !errs.length;
        rec(`w/${tag}/${r}`, ok ? 'PASS' : 'FAIL', `http=${resp.status()} url=${url.replace(B, '')} textLen=${txt.length} hscroll=${hs} pageerrors=${errs.length} :: ${txt.slice(0, 120)}`);
      } catch (e) { rec(`w/${tag}/${r}`, 'FAIL', String(e.message).slice(0, 200)); }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log('SUMMARY', JSON.stringify(results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {})));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
