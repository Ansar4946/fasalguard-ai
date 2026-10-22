// Requires a running isolated web/API/test-PostgreSQL stack and private synthetic-session storage state.
// No browser routes or provider data are mocked. This script never seeds production quotes.
const assert = require('node:assert/strict');
const origin = process.env.F07_WEB_URL;
const storageState = process.env.F07_STORAGE_STATE_PATH;
const expectedRecord = process.env.F07_EXPECT_RECORD_ID;
if (!origin || !storageState || !expectedRecord) {
  console.error('BLOCKED_EXTERNAL: configure F07_WEB_URL, F07_STORAGE_STATE_PATH and F07_EXPECT_RECORD_ID from an isolated persisted test fixture.');
  process.exit(2);
}
const {chromium} = require('playwright');
const url = new URL(origin);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('F07 browser test requires a local isolated preview.');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.F07_BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.F07_BROWSER_EXECUTABLE_PATH} : {})});
  try {
    const context = await browser.newContext({storageState});
    const page = await context.newPage();
    const priceResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/market/prices', {timeout:30000});
    const historyResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/market/history', {timeout:30000});
    await page.goto(new URL('/market-intelligence',url).href);
    const prices = await priceResponse, history = await historyResponse;
    assert.equal(prices.status(),200);assert.equal(history.status(),200);
    const current = await prices.json(), historical = await history.json();
    const persisted = current.records.find(r => r.id === expectedRecord);
    assert.ok(persisted,'Expected persisted test observation must come through the real API');
    assert.equal(persisted.source,'AMIS');assert.equal(persisted.currency,'PKR');assert.equal(persisted.quantity,100);
    assert.ok(historical.records.some(r=>r.id===expectedRecord),'Persisted observation must also be present in history');
    await page.getByText('Source:100 kg').first().waitFor({timeout:15000}).catch(async()=>{
      assert.match(await page.locator('body').innerText(),/100\s*kg/i);
    });
    assert.match(await page.locator('body').innerText(),/40\s*(kg|KG)/);
    const normalized = value => value.replace(/\s+/g,' ').trim();
    const currency = value => new Intl.NumberFormat('en-PK',{style:'currency',currency:'PKR',maximumFractionDigits:0}).format(value);
    const latestDate = current.records.reduce((date,r)=>r.priceDate>date?r.priceDate:date,'');
    const reporting = current.records.filter(r=>r.priceDate===latestDate);
    const expectedAverage = Math.round(reporting.reduce((sum,r)=>sum+r.averagePrice,0)/reporting.length * 40/100);
    const overview = page.locator('article').filter({hasText:'Latest reporting-market average'});
    assert.equal(normalized(await overview.locator('strong').first().innerText()),normalized(currency(expectedAverage)));
    const officialDate = new Intl.DateTimeFormat('en-PK',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Karachi'}).format(new Date(latestDate));
    const overviewText = normalized(await overview.innerText());
    assert.ok(overviewText.includes(`Official price date: ${officialDate}`));
    assert.ok(overviewText.includes(`${reporting.length} reporting markets`));
    const marketRow = page.locator('li').filter({has:page.getByRole('heading',{name:persisted.marketName,exact:true})});
    assert.equal(normalized(await marketRow.locator('strong').innerText()),normalized(currency(Math.round(persisted.averagePrice*40/100))));
    assert.equal(await page.getByText('Live AMIS mandi data could not be loaded.',{exact:false}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'No AMIS market records'}).count(),0);
    // An actual unsigned browser exercises the Next.js session boundary.
    const unsigned = await browser.newContext();
    assert.equal((await unsigned.request.get(new URL('/api/market/prices',url).href)).status(),401);
    await unsigned.close();await context.close();
    console.log(JSON.stringify({status:'RUN_PASS',workflow:'browser→Next BFF→API→persisted test observation',verified:['persisted UUID','source units','displayed market conversion','latest-date mean','official price date','reporting count','no error/empty card','unsigned401'],credentialsLogged:false}));
  } finally {await browser.close();}
})().catch(()=>{console.error('RUN_FAIL: F07 real browser/API/database assertions did not pass.');process.exitCode=1;});
