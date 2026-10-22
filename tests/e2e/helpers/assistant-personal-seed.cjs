// Seed helper for the F10 personal-context QA on the LOCAL demo stack (never production).
//   node assistant-personal-seed.cjs ledger         -> real expenses through the USSD simulator API (PIN flow)
//   node assistant-personal-seed.cjs notifications  -> labelled "QA9 FIXTURE" notifications (see below)
// Expenses use the real simulator state machine, so they are genuine confirmed ledger rows.
// Notifications have no public creation endpoint (producers are internal), so this helper inserts
// clearly labelled rows with the same columns the notification service writes. Credentials come
// from the environment; nothing is printed except counts.
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const mode = process.argv[2];
const api = process.env.QA9_API_URL || 'http://127.0.0.1:4100/api/v1';
const email = process.env.QA9_EMAIL;
const password = process.env.QA9_PASSWORD;
if (!['ledger', 'notifications'].includes(mode) || !email || !password) {
  console.error('usage: QA9_EMAIL=.. QA9_PASSWORD=.. [QA9_PIN=..] [DATABASE_URL=..] node assistant-personal-seed.cjs ledger|notifications');
  process.exit(2);
}
if (!/^(127\.0\.0\.1|localhost)/.test(new URL(api).hostname)) throw new Error('Local stack only.');

async function login() {
  const response = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: email, password, device: { deviceIdentifier: `web-qa9-seed-${Date.now()}`, platform: 'web' } }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`login failed (${response.status})`);
  return { token: body.tokens.accessToken, userId: body.user.id };
}

async function ledger() {
  const pin = process.env.QA9_PIN;
  if (!pin) throw new Error('QA9_PIN is required for the ledger step.');
  const { token } = await login();
  const expenses = [
    ['4', '2500'], // LABOUR PKR 2,500
    ['2', '4300'], // FERTILIZER PKR 4,300
    ['3', '1250'], // PESTICIDE PKR 1,250
  ];
  for (const [category, amount] of expenses) {
    const sessionId = randomUUID();
    let text = '';
    for (const input of ['', pin, '1', '1', category, amount, '1', '1']) {
      const response = await fetch(`${api}/ussd/demo/callback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId: randomUUID(), sessionId, input }),
      });
      if (!response.ok) throw new Error(`simulator step failed (${response.status})`);
      text = (await response.json()).text;
    }
    if (!text.startsWith('END Expense saved.')) throw new Error('expense was not confirmed');
  }
  console.log(`ledger: ${expenses.length} confirmed expenses created through the USSD simulator`);
}

async function notifications() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the notifications step.');
  const { Client } = createRequire(path.resolve(__dirname, '../../../services/api/package.json'))('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const user = (await db.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email])).rows[0];
    if (!user) throw new Error('account not found');
    const rows = [
      ['WEATHER', 'QA9 FIXTURE Heavy rain expected tomorrow', 5],
      ['OUTBREAK', 'QA9 FIXTURE Leaf blight reported near your area', 15],
      ['TASK', 'QA9 FIXTURE Irrigation task due today', 30],
      ['SYSTEM', 'QA9 FIXTURE Check your rice field', 60],
    ];
    for (const [category, title, minutes] of rows)
      await db.query(
        `INSERT INTO notifications(user_id,category,title,body,deduplication_key,created_at) VALUES($1,$2,$3,'QA9 FIXTURE body - not a real alert',$4,now()-make_interval(mins=>$5))
         ON CONFLICT (user_id,deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING`,
        [user.id, category, title, `qa9-fixture:${title}`, minutes],
      );
    console.log(`notifications: ${rows.length} labelled fixtures ensured`);
  } finally {
    await db.end();
  }
}

(mode === 'ledger' ? ledger() : notifications()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
