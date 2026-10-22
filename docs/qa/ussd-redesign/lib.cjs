const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const WEB = 'http://localhost:3100';
const OUT = __dirname;
const STATE = path.join(process.env.TEMP || '.', 'ussd-qa-state.json');
async function login(browser) {
  if (fs.existsSync(STATE)) return STATE;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(WEB + '/login');
  await p.fill('input[name=identifier]', 'ussd.qa.redesign@example.com');
  await p.fill('input[name=password]', 'Ussd-QA-Redesign-2026!x');
  await p.click('button[type=submit]');
  await p.waitForURL('**/dashboard', { timeout: 30000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
  return STATE;
}
async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: await login(browser), hasTouch: w < 700, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(WEB + '/ussd-demo');
  await page.waitForSelector('[data-testid=dialed]');
  return { ctx, page };
}
module.exports = { chromium, WEB, OUT, open, login };
