// Shared QA2 helpers. Secrets come from process.env only; nothing is printed.
const { createRequire } = require('node:module');
const path = require('node:path');
const apiRoot = path.resolve(__dirname, '../../../services/api');
const apiRequire = createRequire(path.join(apiRoot, 'package.json'));
const { Client } = apiRequire('pg');
const jwt = apiRequire('jsonwebtoken');
const crypto = require('node:crypto');
const need = (n) => { if (!process.env[n]) { console.error(`BLOCKED_EXTERNAL: set ${n}`); process.exit(2); } return process.env[n]; };
const DB = () => `postgresql://qa2:${need('QA2_PG')}@127.0.0.1:55442/qa2`;
const API = 'http://127.0.0.1:4022/api/v1';
const WEB = 'http://127.0.0.1:3022';
async function db() { const c = new Client({ connectionString: DB() }); c.on('error', () => {}); await c.connect(); return c; }
async function farmer(c, label, { expired = false } = {}) {
  const userId = crypto.randomUUID(), sessionId = crypto.randomUUID();
  await c.query("INSERT INTO users(id,email,role,status)VALUES($1,$2,'FARMER','active')", [userId, `qa2-${label}-${userId}@example.invalid`]);
  await c.query("INSERT INTO farmer_profiles(user_id,full_name,preferred_language,referral_code)VALUES($1,$2,'en',$3)", [userId, `QA2 ${label}`, crypto.randomBytes(4).toString('hex').toUpperCase()]);
  await c.query("INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at)VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')", [sessionId, userId, crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'), crypto.randomUUID()]);
  const token = jwt.sign({ sub: userId, sid: sessionId, role: 'FARMER', type: 'access' }, need('QA2_JWT'), { issuer: 'fasalguard-api', audience: 'fasalguard-clients', expiresIn: expired ? -60 : '1h' });
  return { userId, sessionId, token };
}
async function call(method, p, { token, body, headers = {}, raw, base = API } = {}) {
  const r = await fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  let json = null; const text = await r.text(); try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const results = [];
async function check(name, fn) {
  try { const d = await fn(); results.push({ name, status: 'PASS', detail: d ?? '' }); }
  catch (e) { results.push({ name, status: e.blocked ? 'BLOCKED' : 'FAIL', detail: String(e.message).split('\n')[0].slice(0, 400) }); }
}
const blocked = (m) => Object.assign(new Error(m), { blocked: true });
module.exports = { Client, jwt, crypto, db, farmer, call, check, results, blocked, API, WEB, need, apiRequire };
