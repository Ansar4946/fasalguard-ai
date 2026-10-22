import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Values are inspected locally but never included in reports. No .env file is loaded. */
export function inspectRuntime(env) {
  const checks = [];
  const check = (name, pass) => checks.push({ name, status: pass ? 'RUN_PASS' : 'BLOCKED_EXTERNAL' });
  const supplied = key => typeof env[key] === 'string' && env[key].trim().length > 0;
  const secureOrigin = value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !/\.(example|invalid)$/.test(u.hostname); }
    catch { return false; }
  };
  const verifiedRedis = value => {
    try { const u = new URL(value); return u.protocol === 'rediss:' && !['none', '0', 'optional'].includes(u.searchParams.get('ssl_cert_reqs')?.toLowerCase()); }
    catch { return false; }
  };
  check('NODE_ENV', env.NODE_ENV === 'production');
  check('WEB_APP_URL', secureOrigin(env.WEB_APP_URL));
  check('JWT_ACCESS_SECRET', supplied('JWT_ACCESS_SECRET') && env.JWT_ACCESS_SECRET.length >= 48 && !/replace|change-me/i.test(env.JWT_ACCESS_SECRET));
  let database = false;
  try { const u = new URL(env.DATABASE_URL); database = u.protocol === 'postgresql:' && u.searchParams.get('sslmode') === 'verify-full'; } catch { /* fail closed */ }
  check('DATABASE_URL_TLS', database);
  check('DATABASE_SSL', env.DATABASE_SSL === 'true');
  check('REDIS_URL_TLS', verifiedRedis(env.REDIS_URL));
  check('PLATFORM_CELERY_BROKER_URL_TLS', verifiedRedis(env.PLATFORM_CELERY_BROKER_URL));
  check('REDIS_NAMESPACE_ISOLATION', supplied('REDIS_URL') && supplied('PLATFORM_CELERY_BROKER_URL') && env.REDIS_URL !== env.PLATFORM_CELERY_BROKER_URL);
  for (const key of ['SMTP_HOST', 'SMTP_FROM', 'OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'METRICS_TOKEN']) check(key, supplied(key));
  check('OBJECT_STORAGE_PROVIDER', env.OBJECT_STORAGE_PROVIDER === 'alibaba');
  check('ENABLE_SWAGGER', env.ENABLE_SWAGGER === 'false');
  if (env.WEATHER_PROVIDER !== 'openweathermap') {
    check('OPEN_METEO_API_KEY', supplied('OPEN_METEO_API_KEY'));
    check('OPEN_METEO_CUSTOMER_ENDPOINT', env.OPEN_METEO_BASE_URL === 'https://customer-api.open-meteo.com');
  } else check('OPENWEATHERMAP_API_KEY', supplied('OPENWEATHERMAP_API_KEY'));
  check('IRRIGATION_WEATHER_API_KEY', supplied('IRRIGATION_WEATHER_API_KEY'));
  check('WAPOR_DISABLED_UNTIL_VERIFIED', env.WAPOR_ENABLED !== 'true');
  return checks;
}

export function inspectSource(projectRoot = root) {
  const checks = [];
  for (const file of ['Dockerfile.web', 'services/api/Dockerfile', 'services/platform-api/Dockerfile',
    'deploy/compose.production.yml', 'deploy/environments/web.production.env.example',
    'deploy/environments/platform.production.env.example', 'app/api/health/route.ts']) {
    checks.push({ name: file, status: existsSync(path.join(projectRoot, file)) ? 'RUN_PASS' : 'RUN_FAIL' });
  }
  const compose = readFileSync(path.join(projectRoot, 'deploy/compose.production.yml'), 'utf8');
  for (const name of ['web', 'api', 'worker', 'ai-service', 'platform-api', 'platform-worker', 'platform-beat', 'migrate'])
    checks.push({ name: `production-service:${name}`, status: compose.includes(`  ${name}:`) ? 'RUN_PASS' : 'RUN_FAIL' });
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceOnly = process.argv.includes('--source');
  const checks = [...inspectSource(), ...(sourceOnly ? [] : inspectRuntime(process.env))];
  const blockers = sourceOnly ? [] : [
    'Production SMS OTP adapter is unimplemented; delivery and verification require a real provider.',
    'F01 real model/provider, storage handoff and complete acceptance evidence remain unverified.',
    'Live satellite water productivity and local expert crop rules remain unverified.',
    'Target-host HTTPS, managed-service access, backups/restore, load and live smoke checks remain unverified.',
  ];
  const failed = checks.some(c => c.status !== 'RUN_PASS');
  console.log(JSON.stringify({ scope: sourceOnly ? 'source packaging only' : 'production release',
    status: failed || blockers.length ? 'BLOCKED_EXTERNAL' : 'RUN_PASS', checks, blockers,
    note: 'Configuration presence does not prove provider authentication or production readiness. No deployment performed.' }, null, 2));
  process.exitCode = failed || blockers.length ? 1 : 0;
}
