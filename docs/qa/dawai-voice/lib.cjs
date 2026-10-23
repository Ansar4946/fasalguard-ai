// Shared helpers for the Dawai Check + voice browser verification (agent F). Secrets come from env only.
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(root, 'node_modules/playwright'));
const sharp = require(path.join(root, 'services/api/node_modules/sharp'));
const B = 'http://localhost:3100';
const OUT = __dirname;
const STATE = path.join(process.env.QA_SCRATCH || OUT, 'state.json');
const results = [];
const rec = (id, status, detail = '') => { results.push({ id, status, detail: String(detail).slice(0, 600) }); console.log(`${status} ${id} :: ${String(detail).slice(0, 300)}`); };
const labels = {
  verified: ['DEMO Imidacloprid 20% SL', 'Active ingredient: Imidacloprid 20% SL', 'Company: Demo AgroChem Pvt Ltd', 'Reg. No: DPP-12345', 'Batch No: B2411', 'Mfg: 03/2026', 'Exp: 12/2030'],
  expired: ['DEMO Imidacloprid 20% SL', 'Active ingredient: Imidacloprid 20% SL', 'Company: Demo AgroChem Pvt Ltd', 'Batch No: B2101', 'Mfg: 01/2022', 'Exp: 01/2024'],
  banned: ['SuperKill 35 EC', 'Active ingredient: Endosulfan 35% EC', 'Company: Unknown Traders', 'Batch No: X77', 'Exp: 12/2030'],
  unknown: ['GreenMax Super Spray', 'Active ingredient: Mystery compound 50% EC', 'Company: Nowhere Chemicals', 'Exp: 12/2030'],
  blank: [],
};
async function label(variant) {
  const lines = labels[variant];
  if (variant === 'blank') return sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 8, g: 8, b: 8 } } }).jpeg().toBuffer();
  const text = lines.map((l, i) => `<text x="60" y="${110 + i * 70}" font-family="Arial" font-size="42" fill="#111">${l.replace(/&/g, '&amp;')}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760"><rect width="100%" height="100%" fill="#f4f1e8"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}
async function login() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const r = await ctx.request.post(B + '/api/auth/login', { headers: { origin: B }, data: { identifier: 'demo.farmer@example.com', password: process.env.QA_PASSWORD } });
  console.log('login', r.status());
  if (r.status() !== 200) throw new Error('login failed ' + r.status());
  await ctx.storageState({ path: STATE });
  await browser.close();
}
const mobile = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const desktop = { viewport: { width: 1440, height: 900 } };
module.exports = { chromium, sharp, B, OUT, STATE, results, rec, label, login, mobile, desktop };
