/* Real F05 web -> BFF -> FastAPI -> PostGIS. Synthetic identities and device coordinates only. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const net = require('node:net');
const { chromium } = require('playwright');
const fixture = JSON.parse(fs.readFileSync(process.env.F05_FIXTURE || '/tmp/f05-browser-fixture.json','utf8'));
for (const feature of fixture.geojson.features) feature.properties.name += ` ${Date.now()}`;
const base = process.env.F05_WEB_URL || 'http://localhost:13006';
const results = [];
let browser;
let proxy;
async function check(name, fn) { await fn(); results.push({name,status:'RUN_PASS'}); console.log('PASS',name); }
(async()=>{
 if (!process.env.F05_WEB_URL) {
  proxy=net.createServer(socket=>{const upstream=net.connect(3000,'fasalguard-f05-web');socket.pipe(upstream);upstream.pipe(socket);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());});
  await new Promise(resolve=>proxy.listen(13006,'127.0.0.1',resolve));
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1100},permissions:['geolocation'],geolocation:{longitude:72.001,latitude:31.001,accuracy:9}});
 await context.addCookies([{name:'fg_access',value:fixture.owner.headers.Authorization.slice(7),url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 await page.goto(`${base}/farms/${fixture.owner.farm}/fields`);
 const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Maps and boundaries'})});
 await section.getByLabel('Field boundary',{exact:true}).waitFor({timeout:30000});
 let holeId,gpsId;
 await check('GeoJSON file import traverses real UI/BFF/API/PostGIS',async()=>{
  await section.getByLabel('Import GeoJSON file').setInputFiles({name:'synthetic-fields.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fixture.geojson))});
  let failReload = true;
  await page.route('**/api/geometry/farms/*/fields/geojson', route => {
   if (!failReload) return route.continue();
   failReload = false;
   return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Isolated reload outage after successful import'}})});
  });
  const response=page.waitForResponse(r=>r.url().endsWith('/fields/import')&&r.request().method()==='POST');
  await section.getByRole('button',{name:'Import fields',exact:true}).click();
  const r=await response;assert.equal(r.status(),201,await r.text());
  const body=await r.json();holeId=body.fields[0].id;gpsId=body.fields[1].id;assert.equal(body.imported,2);
  await section.getByRole('alert').filter({hasText:'Isolated reload outage'}).waitFor();
  const retry = page.waitForResponse(r=>r.url().endsWith('/fields/import')&&r.request().method()==='POST');
  await section.getByRole('button',{name:'Import fields',exact:true}).click();
  const replay=await retry;assert.equal(replay.status(),201);assert.equal((await replay.json()).fields[0].id,holeId);
  await section.getByText('2 field(s) imported.',{exact:false}).waitFor();
  await page.unroute('**/api/geometry/farms/*/fields/geojson');
 });
 await check('Save preserves holes and reload persists version/area',async()=>{
  await section.getByLabel('Field boundary',{exact:true}).selectOption(holeId);
  const validated=page.waitForResponse(r=>r.url().endsWith('/geometry/validate'));
  await section.getByRole('button',{name:'Validate boundary and area'}).click(); assert.equal((await validated).status(),200);
  const saving=page.waitForResponse(r=>r.url().endsWith(`/fields/${holeId}/boundary`));
  await section.getByRole('button',{name:'Save field boundary'}).click(); const response=await saving;assert.equal(response.status(),200,await response.text());
  assert.equal((await response.json()).boundary.coordinates.length,2);
  await page.reload();await section.getByLabel('Field boundary',{exact:true}).selectOption(holeId);
  await section.getByText(/Saved version 2/).waitFor();
  const download=page.waitForEvent('download');await section.getByRole('button',{name:'Download GeoJSON'}).click();
  const d=await download;const json=JSON.parse(fs.readFileSync(await d.path(),'utf8'));
  const f=json.features.find(f=>f.id===holeId);assert.equal(f.geometry.coordinates.length,2);assert.equal(f.properties.version,2);assert(f.properties.areaAcres>0);
 });
 await check('Invalid topology is rejected with a visible retained import',async()=>{
  const invalid={type:'Polygon',coordinates:[[[72.0002,31.0002],[72.0008,31.0008],[72.0002,31.0008],[72.0008,31.0002],[72.0002,31.0002]]]};
  await section.getByLabel('Import GeoJSON file').setInputFiles({name:'invalid.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  const response=page.waitForResponse(r=>r.url().endsWith('/fields/import'));
  await section.getByRole('button',{name:'Import fields',exact:true}).click();assert.equal((await response).status(),400);
  await section.getByRole('alert').waitFor();assert(await section.getByRole('button',{name:'Import fields',exact:true}).isEnabled());
 });
 await check('Boundary service outage retains the selected geometry',async()=>{
  await page.route('**/api/geometry/validate',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Isolated test outage; retry shortly.'}})}));
  await section.getByRole('button',{name:'Validate boundary and area'}).click();await section.getByRole('alert').filter({hasText:'Isolated test outage'}).waitFor();
  assert(await section.getByRole('button',{name:'Save field boundary'}).isEnabled());await page.unroute('**/api/geometry/validate');
 });
 await check('Simulated GPS corners require confirmation and persist real metadata',async()=>{
  await section.getByLabel('Field boundary',{exact:true}).selectOption(gpsId);
  await section.getByRole('button',{name:'Start new GPS boundary'}).click();
  for(const [longitude,latitude] of [[72.001,31.001],[72.0013,31.001],[72.0013,31.0013],[72.001,31.0013]]){
   await context.setGeolocation({longitude,latitude,accuracy:9});await section.getByRole('button',{name:'Capture GPS vertex',exact:true}).click();
   await section.getByRole('button',{name:'Add this GPS vertex'}).click();
  }
  assert(await section.getByRole('button',{name:'Save field boundary'}).isDisabled());
  await section.getByRole('checkbox',{name:/I reviewed GPS accuracy/}).check();
  const response=page.waitForResponse(r=>r.url().endsWith(`/fields/${gpsId}/boundary`));await section.getByRole('button',{name:'Save field boundary'}).click();
  const r=await response;assert.equal(r.status(),200,await r.text());assert.equal((await r.json()).version,2);
  await section.getByText('Boundary saved.',{exact:false}).waitFor();
 });
 await check('GPS permission denial reports an error and adds no corner',async()=>{
  await context.clearPermissions();await context.grantPermissions([]);
  await section.getByRole('button',{name:'Start new GPS boundary'}).click();await section.getByRole('button',{name:'Capture GPS vertex',exact:true}).click();
  await section.getByRole('alert').waitFor();assert(await section.getByRole('button',{name:'Save field boundary'}).isDisabled());
 });
 await check('Owner boundaries stay private; foreign origin and oversized requests fail',async()=>{
  const foreign=await browser.newContext();await foreign.addCookies([{name:'fg_access',value:fixture.other.headers.Authorization.slice(7),url:base}]);
  assert.equal((await foreign.request.get(`${base}/api/geometry/farms/${fixture.owner.farm}/fields/geojson`)).status(),404);
  assert.equal((await context.request.post(`${base}/api/geometry/validate`,{headers:{Origin:'https://attacker.invalid'},data:{}})).status(),403);
  assert.equal((await context.request.post(`${base}/api/geometry/validate`,{headers:{Origin:base},data:'x'.repeat(270000)})).status(),413);
  await foreign.close();
 });
 await check('Unavailable map tiles do not block saved field loading',async()=>{
  await page.route(/tile\.openstreetmap\.org|MapServer\/tile/,r=>r.abort());await page.reload();
  await section.getByLabel('Field boundary',{exact:true}).selectOption(holeId);await section.getByText(/Saved version 2/).waitFor();
 });
 await page.screenshot({path:'/tmp/f05-browser.png',fullPage:true});
 fs.writeFileSync('/tmp/f05-browser-result.json',JSON.stringify({status:'RUN_PASS',checks:results,syntheticDeviceGps:true,importedFieldIds:[holeId,gpsId]},null,2));
 await browser.close(); if(proxy)proxy.close();
})().catch(async error=>{console.error(error.message);fs.writeFileSync('/tmp/f05-browser-result.json',JSON.stringify({status:'RUN_FAIL',checks:results,error:error.message},null,2));if(browser)await browser.close();if(proxy)proxy.close();process.exitCode=1;});
