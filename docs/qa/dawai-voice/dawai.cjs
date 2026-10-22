const fs = require('node:fs'); const path = require('node:path');
const { chromium, B, OUT, STATE, results, rec, label, mobile, desktop } = require('./lib.cjs');
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
const FORBID = /\b(genuine|authentic|safe to use|is safe|100% safe)\b/i;
async function metrics(page) {
  return page.evaluate(() => ({
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll('button, a[href], input:not([type=hidden]):not(.sr-only), select')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 43.5) && !e.classList.contains('sr-only') && !(e.tagName==='INPUT'&&e.type==='file'); }).map((e) => (e.innerText || e.getAttribute('aria-label') || e.tagName).slice(0, 30) + ':' + Math.round(e.getBoundingClientRect().height)),
    dir: document.querySelector('[lang][dir]')?.getAttribute('dir'), lang: document.querySelector('[lang][dir]')?.getAttribute('lang'),
  }));
}
async function runVariant(browser, variant, lang, opts, tag) {
  const ctx = await browser.newContext({ ...opts, storageState: STATE });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(B + '/dawai-check', { waitUntil: 'load' });
  if (lang === 'ur') await page.getByRole('button', { name: 'اردو' }).click();
  await page.waitForTimeout(300);
  const img = await label(variant);
  const p = path.join(process.env.QA_SCRATCH || OUT, `label-${variant}.jpg`); fs.writeFileSync(p, img);
  const stages = new Set();
  const poll = setInterval(async () => { try { const t = await page.locator('main').innerText({ timeout: 300 }); if (/Uploading photo|Reading the label|Matching|اپ لوڈ|پڑھ/.test(t)) stages.add('seen'); } catch {} }, 150);
  await page.locator('input[type=file]').setInputFiles(p);
  await page.waitForTimeout(800);
  if (variant === 'verified' && lang === 'en') await shot(page, `${tag}-01-capture-preview-en`);
  await page.getByRole('button', { name: lang === 'ur' ? /.*/ : 'Check this label' }).last().click().catch(async () => { await page.locator('section button.w-full, .sticky button').last().click(); });
  // analysing screen
  let sawAnalysing = false;
  try { await page.locator('[aria-labelledby], section').filter({ hasText: lang === 'ur' ? '' : 'Checking your pesticide' }).first().waitFor({ timeout: 4000 }); sawAnalysing = true; if (variant==='verified') await shot(page, `${tag}-02-analysing-${lang}`); } catch {}
  await page.locator('#dc-verdict-title').waitFor({ timeout: 90000 });
  clearInterval(poll);
  await page.waitForTimeout(500);
  const title = (await page.locator('#dc-verdict-title').innerText()).trim();
  const body = await page.locator('main').innerText();
  const m = await metrics(page);
  const checks = await page.locator('#dc-checks-title').locator('xpath=..').locator('li').allInnerTexts();
  const score = await page.locator('[role=img][aria-label*="/"], div.relative.size-20').first().getAttribute('aria-label').catch(() => null);
  const demoBadge = await page.getByText('DEMO DATASET').count() + await page.getByText('ڈیمو').count();
  const chips = await page.locator('#dc-read-title').locator('xpath=../..').locator('input').evaluateAll((els) => els.map((e) => e.value));
  await shot(page, `${tag}-03-result-${variant}-${lang}`);
  const heroBg = await page.locator('section[aria-labelledby=dc-verdict-title]').evaluate((e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).borderColor);
  await ctx.close();
  return { title, body, m, checks, score, demoBadge, chips, heroBg, sawAnalysing, errs };
}
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    const variants = tag === 'm' ? ['verified', 'expired', 'banned', 'unknown', 'blank'] : ['verified', 'banned'];
    for (const v of variants) {
      try {
        const r = await runVariant(browser, v, 'en', opts, tag);
        out[`${tag}-${v}`] = r;
        const want = { verified: /Consistent with the demo list/, expired: /Something does not look right/, banned: /High risk/, unknown: /Something does not look right/, blank: /could not read/i }[v];
        rec(`${tag}/${v}/verdict`, want.test(r.title) ? 'PASS' : 'FAIL', `title="${r.title}" heroBg=${r.heroBg} score=${r.score}`);
        rec(`${tag}/${v}/no-forbidden-wording`, FORBID.test(r.body) ? 'FAIL' : 'PASS', (r.body.match(FORBID) || [''])[0]);
        rec(`${tag}/${v}/demo-badge`, r.demoBadge > 0 ? 'PASS' : (v==='blank'?'N/A':'FAIL'), `count=${r.demoBadge}`);
        rec(`${tag}/${v}/layout`, r.m.hscroll <= 0 && (tag === 'd' || r.m.small.length === 0) ? 'PASS' : 'FAIL', `hscroll=${r.m.hscroll} small=${JSON.stringify(r.m.small)}`);
        rec(`${tag}/${v}/checks-order`, 'INFO', r.checks.map((c) => c.split('\n')[0] + ' ' + (c.split('\n')[1] || '').slice(0, 30)).join(' | '));
        rec(`${tag}/${v}/chips`, 'INFO', JSON.stringify(r.chips));
        rec(`${tag}/${v}/pageerrors`, r.errs.length ? 'FAIL' : 'PASS', r.errs.join(';'));
      } catch (e) { rec(`${tag}/${v}`, 'FAIL', e.message.split('\n')[0]); }
    }
  }
  // Urdu
  for (const [tag, opts] of [['m', mobile], ['d', desktop]]) {
    for (const v of tag==='m' ? ['verified','banned','blank'] : ['verified']) {
      try {
        const r = await runVariant(browser, v, 'ur', opts, tag);
        const hasUrdu = /[\u0600-\u06FF]{3,}/.test(r.body);
        rec(`${tag}/${v}/urdu`, r.m.dir === 'rtl' && r.m.lang === 'ur' && hasUrdu && r.m.hscroll <= 0 && (tag === 'd' || r.m.small.length === 0) ? 'PASS' : 'FAIL', `dir=${r.m.dir} lang=${r.m.lang} urdu=${hasUrdu} hscroll=${r.m.hscroll} small=${JSON.stringify(r.m.small)} title="${r.title}"`);
        rec(`${tag}/${v}/urdu-forbidden`, FORBID.test(r.body) ? 'FAIL' : 'PASS');
      } catch (e) { rec(`${tag}/${v}/urdu`, 'FAIL', e.message.split('\n')[0]); }
    }
  }
  fs.writeFileSync(path.join(process.env.QA_SCRATCH || OUT, 'dawai-out.json'), JSON.stringify({ results, out }, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
