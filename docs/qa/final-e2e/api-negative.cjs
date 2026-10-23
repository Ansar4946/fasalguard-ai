// FINAL E2E (n): API-level negative tests through the web BFF. Throwaway users use @example.invalid emails; password from env QA_THROWAWAY_PW.
const fs = require('node:fs');
const path = require('node:path');
const B = 'http://localhost:3100', API = 'http://127.0.0.1:4100/api/v1';
const pw = process.env.QA_THROWAWAY_PW;
const results = [];
const rec = (id, status, d = '') => { results.push({ id, status, detail: d }); console.log(status, id, '::', d); fs.writeFileSync(path.join(__dirname, 'api-negative-results.json'), JSON.stringify(results, null, 1)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
async function register(tag) {
  const r = await fetch(API + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    email: `qa-final-${tag}-${stamp}@example.invalid`, password: pw, fullName: 'QA Throwaway ' + tag, preferredLanguage: 'en',
    consents: [{ type: 'AI_IMAGE_ANALYSIS', policyVersion: '1', granted: true }], device: { deviceIdentifier: 'qa-final-device-' + tag + stamp, platform: 'web' } }) });
  return { status: r.status, email: `qa-final-${tag}-${stamp}@example.invalid`, body: await r.text() };
}
async function bffLogin(email) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ identifier: email, password: pw }) });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, cookie };
}
(async () => {
  const un = await fetch(B + '/api/pesticide-checks');
  rec('n/unauth-list', un.status === 401 ? 'PASS' : 'FAIL', 'GET /api/pesticide-checks no cookie -> ' + un.status);
  const un2 = await fetch(B + '/api/pesticide-checks/manual', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ brandName: 'x' }) });
  rec('n/unauth-manual', un2.status === 401 ? 'PASS' : 'FAIL', 'POST manual no cookie -> ' + un2.status);
  const un3 = await fetch(B + '/api/assistant/ask', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: '{}' });
  rec('n/unauth-assistant', [401].includes(un3.status) ? 'PASS' : 'INFO', 'POST /api/assistant/ask no cookie -> ' + un3.status);
  const A = await register('a'), Bn = await register('b');
  rec('n/register', A.status === 201 && Bn.status === 201 ? 'PASS' : 'FAIL', `A=${A.status} B=${Bn.status} ${A.status !== 201 ? A.body.slice(0, 200) : ''}`);
  if (A.status !== 201 || Bn.status !== 201) return;
  await sleep(1500);
  const la = await bffLogin(A.email), lb = await bffLogin(Bn.email);
  rec('n/login-bff', la.status === 200 && lb.status === 200 ? 'PASS' : 'FAIL', `A=${la.status} B=${lb.status}`);
  if (la.status !== 200 || lb.status !== 200) return;
  const h = (c) => ({ 'content-type': 'application/json', origin: B, cookie: c });
  const mk = await fetch(B + '/api/pesticide-checks/manual', { method: 'POST', headers: h(la.cookie), body: JSON.stringify({ brandName: 'Endosulfan 35% EC', activeIngredient: 'Endosulfan', language: 'en' }) });
  const created = await mk.json();
  rec('n/A-creates-check', mk.status === 201 && created.id ? 'PASS' : 'FAIL', `status=${mk.status} verdict=${created.verdict}`);
  const own = await fetch(B + '/api/pesticide-checks/' + created.id, { headers: h(la.cookie) });
  rec('n/A-reads-own', own.status === 200 ? 'PASS' : 'FAIL', 'status ' + own.status);
  const other = await fetch(B + '/api/pesticide-checks/' + created.id, { headers: h(lb.cookie) });
  rec('n/B-reads-A-check-404', other.status === 404 ? 'PASS' : 'FAIL', 'status ' + other.status);
  const lst = await (await fetch(B + '/api/pesticide-checks', { headers: h(lb.cookie) })).json();
  const arr = Array.isArray(lst) ? lst : lst.items || lst.data || [];
  rec('n/B-list-excludes-A', !JSON.stringify(arr).includes(created.id) ? 'PASS' : 'FAIL', 'B list length ' + arr.length);
  const bogus = await fetch(B + '/api/pesticide-checks/00000000-0000-4000-8000-000000000000', { headers: h(la.cookie) });
  rec('n/unknown-id-404', bogus.status === 404 ? 'PASS' : 'FAIL', 'status ' + bogus.status);
  const bad = await fetch(B + '/api/pesticide-checks', { method: 'POST', headers: h(la.cookie), body: JSON.stringify({ mediaAssetId: 'not-a-uuid', language: 'en' }) });
  rec('n/bad-body-400', bad.status === 400 || bad.status === 422 ? 'PASS' : 'FAIL', 'status ' + bad.status);
  console.log('EMAILS', A.email, Bn.email);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
