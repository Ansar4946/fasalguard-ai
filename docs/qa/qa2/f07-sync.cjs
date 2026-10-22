// Runs INSIDE qa2-api (docker cp + node). Drives the real AmisMarketPriceProvider + MarketProcessor against the
// qa2 database. MODE=real | unreachable | ssrf | malformed | disabled. Never prints secrets.
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const configuration = require('/app/dist/config/configuration.js').default;
const { MarketProcessor } = require('/app/dist/domain/market/market.processor.js');
const { MarketService } = require('/app/dist/domain/market/market.service.js');
const { RedisService } = require('/app/dist/infrastructure/redis/redis.service.js');
const { AmisMarketPriceProvider } = require('/app/dist/domain/market/providers/amis-market-price.provider.js');
const mode = process.env.MODE || 'real';
(async () => {
  const url = process.env.DATABASE_URL;
  if (new URL(url).pathname.slice(1) !== 'qa2') throw new Error('qa2 database only');
  if (mode === 'unreachable') process.env.AMIS_BASE_URL = 'http://127.0.0.1:9';
  if (mode === 'ssrf') process.env.AMIS_BASE_URL = 'http://169.254.169.254';
  if (mode === 'disabled') process.env.AMIS_SYNC_ENABLED = 'false';
  process.env.AMIS_TIMEOUT_SECONDS = '8';
  const config = new ConfigService(configuration());
  const db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
  const redis = new RedisService(config);
  await db.initialize();
  await redis.onModuleInit();
  const before = (await db.query('SELECT count(*)::int n FROM mandi_prices'))[0].n;
  let provider = new AmisMarketPriceProvider(config);
  if (mode === 'malformed') provider = new AmisMarketPriceProvider(config, async () => new Response('<html><body>maintenance page</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  if (mode === 'captured') { // genuine AMIS HTML captured by the F07 team on 2026-10-14, replayed through the real provider/parser
    const files = { 1: 'wheat', 17: 'maize', 4: 'rice', 49: 'cotton', 125: 'sugarcane' };
    provider = new AmisMarketPriceProvider(config, async (u) => new Response(require('fs').readFileSync('/tmp/amis/amis-' + files[new URL(u).searchParams.get('commodityId')] + '.html', 'utf8'), { status: 200, headers: { 'content-type': 'text/html' } }));
  }
  if (mode === 'http500') provider = new AmisMarketPriceProvider(config, async () => new Response('boom', { status: 500 }));
  const market = new MarketService(db, redis, config);
  const processor = new MarketProcessor(db, provider, market);
  const out = { mode, before };
  const t0 = Date.now();
  try {
    out.result = await processor.process({ name: 'sync_mandi_rates' });
  } catch (e) {
    out.error = { name: e.name, code: e.code ?? null, message: String(e.message).slice(0, 160), retryable: e.retryable ?? null };
  }
  out.ms = Date.now() - t0;
  out.after = (await db.query('SELECT count(*)::int n FROM mandi_prices'))[0].n;
  out.latest = (await db.query("SELECT crop_name crop, count(*)::int n, max(price_date)::text d FROM mandi_prices GROUP BY crop_name ORDER BY crop_name"));
  console.log(JSON.stringify(out));
  await redis.onModuleDestroy();
  await db.destroy();
})().catch((e) => { console.error(JSON.stringify({ fatal: String(e.message).slice(0, 300) })); process.exitCode = 1; });
