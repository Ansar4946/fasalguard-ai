// REAL end-to-end (no mocks): 4 labels x en/ur on mobile, then history + manual once. Uses ~8 uploads.
const fs = require('node:fs');
const path = require('node:path');
const { chromium, B, STATE, label, mobile } = require('../dawai-voice/lib.cjs');
const OUT = __dirname; const SCRATCH = process.env.QA_SCRATCH || OUT;
const results = []; const rec = (id, status, d = '') => { results.push({ id, status, detail: String(d).slice(0, 300) }); console.log(status, id, '::', String(d).slice(0, 200)); };
const FORBID = /\b(genuine|authentic|safe to use|is safe|100% safe)\b/i;
const want = { verified: /Consistent with the demo list|ڈیمو فہرست کے مطابق/, expired: /Something does not look right|کچھ ٹھیک نہیں/, banned: /High risk|زیادہ خطرہ/, blank: /could not read|پڑھ نہیں سکے/ };
(async () => {
  const browser = await chromium.launch();
  for (const lang of ['en', 'ur']) {
    const ctx = await browser.newContext({ ...mobile, storageState: STATE });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(B + '/dawai-check', { waitUntil: 'load' });
    if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).click();
    for (const v of ['verified', 'expired', 'banned', 'blank']) {
      try {
        const f = path.join(SCRATCH, `label-${v}.jpg`); fs.writeFileSync(f, await label(v));
        await page.locator('input[type=file]').setInputFiles(f);
        await page.waitForTimeout(600);
        await page.locator('.sticky button, section button.w-full').filter({ hasText: /Check this label|لیبل کو جانچیں/ }).last().click();
        await page.waitForTimeout(700);
        if (v === 'verified') await page.screenshot({ path: path.join(OUT, `REAL-m-analysing-${lang}.png`) });
        await page.locator('#dc-verdict-title').waitFor({ timeout: 90000 });
        await page.waitForTimeout(1900);
        const title = (await page.locator('#dc-verdict-title').innerText()).trim();
        const body = await page.locator('main').first().innerText();
        const hs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await page.screenshot({ path: path.join(OUT, `REAL-m-result-${v}-${lang}.png`), fullPage: true });
        const ring = await page.locator('section[aria-labelledby=dc-verdict-title] [role=img]').count();
        rec(`real/${lang}/${v}`, want[v].test(title) && !FORBID.test(body) && hs <= 0 && (v === 'blank' ? ring === 0 : ring === 1) ? 'PASS' : 'FAIL', `title="${title}" ring=${ring} hscroll=${hs}`);
        await page.getByRole('button', { name: /Check another|ایک اور جانچیں/ }).click();
        await page.waitForTimeout(500);
      } catch (e) { rec(`real/${lang}/${v}`, 'FAIL', e.message.split('\n')[0]); await page.goto(B + '/dawai-check'); if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).click(); }
    }
    if (lang === 'en') {
      await page.getByRole('button', { name: 'History' }).click(); await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'REAL-m-history-en.png'), fullPage: true });
      const rows = await page.locator('#dc-history-title').locator('xpath=..').locator('li').count();
      rec('real/history', rows > 0 ? 'PASS' : 'FAIL', 'rows=' + rows);
      await page.locator('#dc-history-title').locator('xpath=..').locator('li button').first().click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 15000 }); rec('real/history-open', 'PASS');
      await page.getByRole('button', { name: 'Check another' }).click();
      await page.getByRole('button', { name: 'Type the name' }).first().click();
      await page.getByRole('combobox').fill('imid'); await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'REAL-m-manual-suggestions-en.png') });
      rec('real/manual-suggest', (await page.getByRole('option').count()) > 0 ? 'PASS' : 'FAIL');
      await page.getByRole('option').first().click();
      await page.getByRole('button', { name: 'Check this name' }).click();
      await page.locator('#dc-verdict-title').waitFor({ timeout: 30000 }); rec('real/manual-check', 'PASS', await page.locator('#dc-verdict-title').innerText());
    }
    rec(`real/${lang}/pageerrors`, errs.length ? 'FAIL' : 'PASS', errs.join(';'));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'real-results.json'), JSON.stringify(results, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
