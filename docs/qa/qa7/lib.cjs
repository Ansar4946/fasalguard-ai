// Shared QA7 helpers (isolated stack: pg 55447, redis 56447, core API 4027, web 3027, platform API 8027).
// Secrets come from process.env only (QA7_PG, QA7_JWT); nothing secret is printed or written.
const { createRequire } = require('node:module');
const path = require('node:path');
const apiRoot = path.resolve(__dirname, '../../../services/api');
const apiRequire = createRequire(path.join(apiRoot, 'package.json'));
const { Client } = apiRequire('pg');
const jwt = apiRequire('jsonwebtoken');
const crypto = require('node:crypto');
const fs = require('node:fs');
const need = (n) => { if (!process.env[n]) { console.error(`BLOCKED_EXTERNAL: set ${n}`); process.exit(2); } return process.env[n]; };
const DBURL = (name = 'qa7') => `postgresql://qa7:${need('QA7_PG')}@127.0.0.1:55447/${name}`;
const API = 'http://127.0.0.1:4027/api/v1';
const PLAT = 'http://127.0.0.1:8027/api/v1';
const WEB = 'http://127.0.0.1:3027';
const CROPS = { cotton: 'f63029b9-ab16-4244-ac5c-b6bda5ef1654', wheat: 'f38978c4-5ac7-4a6a-bd41-048076e7747d', rice: '1b82e532-af74-4a6d-ab27-61e0f7177790', maize: '920a4beb-a858-415d-888a-902af4d85f92' };
async function db(name) { const c = new Client({ connectionString: DBURL(name) }); c.on('error', () => {}); await c.connect(); return c; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function farmer(c, label, { role = 'FARMER', expired = false } = {}) {
  const userId = crypto.randomUUID(), sessionId = crypto.randomUUID();
  await c.query("INSERT INTO users(id,email,role,status)VALUES($1,$2,$3,'active')", [userId, `qa7-${label}-${userId}@example.invalid`, role]);
  if (role === 'FARMER') await c.query("INSERT INTO farmer_profiles(user_id,full_name,preferred_language,referral_code)VALUES($1,$2,'en',$3)", [userId, `QA7 ${label}`, crypto.randomBytes(4).toString('hex').toUpperCase()]);
  await c.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at)VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')", [sessionId, userId, crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'), crypto.randomUUID()]);
  const token = jwt.sign({ sub: userId, sid: sessionId, role, type: 'access' }, need('QA7_JWT'), { issuer: 'fasalguard-api', audience: 'fasalguard-clients', expiresIn: expired ? -60 : '2h' });
  return { userId, sessionId, token };
}
async function call(method, p, { token, body, headers = {}, raw, base = API, timeout = 60000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(base + p, { method, signal: ctl.signal, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    let json = null; const text = await r.text(); try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  } catch (e) { return { status: 0, json: null, text: String(e.message), headers: new Headers() }; } finally { clearTimeout(t); }
}
const square = (lon, lat, d = 0.002) => ({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
// Real HTTP: create farm + field (+ crop cycle) through the core API.
async function makeField(u, { lon = 72.5, lat = 31.5, crop = 'wheat', sowing = '2025-11-15', status = 'active', name = 'QA7 field', farmLon, farmLat, farmSize = 0.5 } = {}) {
  let farm = { json: { id: u.farmId } };
  if (!u.farmId) {
    farm = await call('POST', '/farms', { token: u.token, body: { name: 'QA7 farm ' + crypto.randomBytes(2).toString('hex'), boundary: square(farmLon ?? lon - 0.001, farmLat ?? lat - 0.001, farmSize), province: 'Punjab', district: 'Faisalabad' } });
    if (farm.status !== 201) throw new Error('farm create ' + farm.status + ' ' + farm.text.slice(0, 200));
    u.farmId = farm.json.id;
  }
  const body = { name: name + ' ' + crypto.randomBytes(2).toString('hex'), boundary: square(lon, lat) };
  if (crop) body.currentCropCycle = { cropId: CROPS[crop], status, sowingDate: sowing, expectedHarvestDate: '2026-12-30' };
  const field = await call('POST', `/farms/${farm.json.id}/fields`, { token: u.token, body });
  if (field.status !== 201) throw new Error('field create ' + field.status + ' ' + field.text.slice(0, 300));
  return { farmId: farm.json.id, fieldId: field.json.id, field: field.json };
}
const results = [];
async function check(id, name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(id)) return;
  const t0 = Date.now();
  try { const d = await fn(); results.push({ id, name, status: 'PASS', detail: String(d ?? '').slice(0, 600), ms: Date.now() - t0 }); }
  catch (e) { results.push({ id, name, status: e.blocked ? 'BLOCKED' : 'FAIL', detail: String(e.message).split('\n')[0].slice(0, 600), ms: Date.now() - t0 }); }
  const r = results[results.length - 1]; console.log(`${r.status} ${id} ${name} :: ${r.detail.slice(0, 200)}`);
}
const blocked = (m) => Object.assign(new Error(m), { blocked: true });
function finish(file) { fs.writeFileSync(file, JSON.stringify(results, null, 1)); const n = (s) => results.filter((r) => r.status === s).length; console.log(`SUMMARY pass=${n('PASS')} fail=${n('FAIL')} blocked=${n('BLOCKED')}`); }
const sh = (cmd) => require('node:child_process').execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
module.exports = { Client, jwt, crypto, db, farmer, call, makeField, check, results, blocked, finish, sleep, sh, API, PLAT, WEB, CROPS, need, apiRequire, square, DBURL };
