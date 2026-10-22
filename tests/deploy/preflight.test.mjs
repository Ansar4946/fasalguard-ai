import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectRuntime, inspectSource } from '../../scripts/release-preflight.mjs';

test('production source includes all runtime services and the web health endpoint', () => {
  assert(inspectSource().every(c => c.status === 'RUN_PASS'));
});
test('empty deployment configuration cannot pass', () => {
  assert(inspectRuntime({}).some(c => c.status === 'BLOCKED_EXTERNAL'));
});
test('reports never disclose supplied credentials', () => {
  const report = JSON.stringify(inspectRuntime({ JWT_ACCESS_SECRET: 'do-not-disclose-this-value', DATABASE_URL: 'postgresql://user:do-not-disclose@db/db' }));
  assert(!report.includes('do-not-disclose'));
});
test('TLS disabled via Redis query cannot pass', () => {
  const checks = inspectRuntime({ REDIS_URL: 'rediss://cache/0?ssl_cert_reqs=none' });
  assert.equal(checks.find(c => c.name === 'REDIS_URL_TLS').status, 'BLOCKED_EXTERNAL');
});
