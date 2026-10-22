// Assistant browser pass: Urdu default, RTL, toggle, chips, cited answers, abstain, account chip, warnings card, Listen, recording UI.
const fs = require('node:fs'); const path = require('node:path');
const { chromium, B, OUT, STATE, results, rec, mobile, desktop } = require('./lib.cjs');
const S = process.env.QA_SCRATCH;
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
const URDU = /[؀-ۿ]{2,}/;
async function ask(page, text, lang) {
  const before = await page.locator('section[aria-labelledby=chat-heading] article').count();
  await page.locator('#assistant-question').fill(text);
  await page.locator('section[aria-labelledby=chat-heading] form button[type=submit]').click();
  await page.waitForFunction((n) => document.querySelectorAll('section[aria-labelledby=chat-heading] article').length >= n + 2, before, { timeout: 60000 });
  const arts = page.locator('section[aria-labelledby=chat-heading] article');
  return (await arts.last().innerText());
}
const metrics = (page) => page.evaluate(() => ({ hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    const ctx = await browser.newContext({ ...opts, storageState: STATE, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/assistant', { waitUntil: 'load' });
    await page.locator('[data-testid=assistant-region]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    const region = page.locator('[data-testid=assistant-region]');
    rec(`${tag}/assistant/urdu-default-rtl`, (await region.getAttribute('dir')) === 'rtl' && (await region.getAttribute('lang')) === 'ur' && URDU.test(await region.innerText()) ? 'PASS' : 'FAIL', `dir=${await region.getAttribute('dir')} lang=${await region.getAttribute('lang')}`);
    const hs = await metrics(page); rec(`${tag}/assistant/no-hscroll-ur`, hs.hscroll <= 0 ? 'PASS' : 'FAIL', `hscroll=${hs.hscroll}`);
    const chipsUr = await page.locator('[data-testid=starter-chips] button').allInnerTexts();
    rec(`${tag}/assistant/starter-chips-ur`, chipsUr.length === 6 && chipsUr.every((c) => URDU.test(c)) ? 'PASS' : 'FAIL', `${chipsUr.length} chips`);
    const warn = await page.locator('[data-testid=warnings-card]').count();
    rec(`${tag}/assistant/warnings-card`, warn ? 'PASS' : 'INFO', warn ? (await page.locator('[data-testid=warnings-card]').innerText()).replace(/\n+/g, ' | ').slice(0, 200) : 'no card (no briefing)');
    await shot(page, `${tag}-20-assistant-ur`);
    // small targets
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid=assistant-region] button, [data-testid=assistant-region] select, [data-testid=assistant-region] textarea')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5; }).map((e) => (e.innerText || e.getAttribute('aria-label') || e.tagName).slice(0, 25) + ':' + Math.round(e.getBoundingClientRect().height)));
    rec(`${tag}/assistant/touch-targets`, small.length ? 'FAIL' : 'PASS', JSON.stringify(small));
    // toggle to English
    await page.getByRole('button', { name: 'English' }).first().click(); await page.waitForTimeout(400);
    rec(`${tag}/assistant/toggle-en`, (await region.getAttribute('dir')) === 'ltr' && (await region.getAttribute('lang')) === 'en' ? 'PASS' : 'FAIL');
    await shot(page, `${tag}-21-assistant-en`);
    // new conversation to keep things clean
    const nc = page.getByRole('button', { name: 'New conversation' }); if (await nc.count()) await nc.click();
    // English farming Q
    const en = await ask(page, 'Why are my wheat leaves turning yellow?', 'en');
    const grounded = /Sources/.test(en) && /DEMO/i.test(en);
    rec(`${tag}/assistant/en-cited-demo`, grounded ? 'PASS' : 'FAIL', en.replace(/\n+/g, ' | ').slice(0, 400));
    rec(`${tag}/assistant/en-listen-btn`, (await page.locator('section[aria-labelledby=chat-heading] article').last().getByRole('button', { name: 'Listen' }).count()) ? 'PASS' : 'FAIL');
    await shot(page, `${tag}-22-answer-en`);
    // Urdu
    await page.getByRole('button', { name: 'اردو' }).first().click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /نئی گفتگو|New conversation/ }).first().click().catch(() => {});
    const ur = await ask(page, 'میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟', 'ur');
    rec(`${tag}/assistant/ur-cited-demo`, /DEMO/i.test(ur) && ur.split('\n').length > 2 ? 'PASS' : 'FAIL', ur.replace(/\n+/g, ' | ').slice(0, 500));
    await shot(page, `${tag}-23-answer-ur`);
    // off-topic
    await page.getByRole('button', { name: 'English' }).first().click();
    await page.getByRole('button', { name: 'New conversation' }).first().click().catch(() => {});
    const off = await ask(page, 'what is the capital of France', 'en');
    rec(`${tag}/assistant/offtopic-abstains`, /not an answer|No approved guidance/i.test(off) && !/Paris/i.test(off) ? 'PASS' : 'FAIL', off.replace(/\n+/g, ' | ').slice(0, 300));
    await shot(page, `${tag}-24-offtopic-en`);
    // account
    await page.getByRole('button', { name: 'New conversation' }).first().click().catch(() => {});
    const acc = await ask(page, 'Which farms do I have?', 'en');
    const chip = await page.locator('[data-testid=account-chip]').count();
    rec(`${tag}/assistant/account-chip`, chip ? 'PASS' : 'FAIL', acc.replace(/\n+/g, ' | ').slice(0, 300));
    await shot(page, `${tag}-25-account-en`);
    rec(`${tag}/assistant/pageerrors`, errs.length ? 'FAIL' : 'PASS', errs.join(';'));
    await ctx.close();
  }
  fs.writeFileSync(`${S}/assistant-out.json`, JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(`${S}/assistant-out.json`, JSON.stringify(results, null, 1)); process.exit(1); });
