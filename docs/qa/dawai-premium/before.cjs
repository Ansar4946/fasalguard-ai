// BEFORE screenshots from the pre-redesign build (run once, before the rebuild).
const path = require('node:path');
const { chromium, B, STATE, login, mobile, desktop } = require('../dawai-voice/lib.cjs');
const OUT = __dirname;
(async () => {
  await login();
  const browser = await chromium.launch();
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    const ctx = await browser.newContext({ ...opts, storageState: STATE });
    const page = await ctx.newPage();
    await page.goto(B + '/dawai-check', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `before-${tag}-capture-idle-en.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
})();
