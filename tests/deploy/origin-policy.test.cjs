const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../lib/auth/origin-policy.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { mutationOriginAllowed } = loaded.exports;
const env = { NODE_ENV: 'production', WEB_APP_URL: 'https://app.fasalguard.test' };
const req = origin => new Request('http://web:3000/api/test', { headers: { host: 'web:3000', ...(origin ? { origin } : {}) } });

test('canonical HTTPS origin works behind an HTTP reverse proxy', () => assert.equal(mutationOriginAllowed(req(env.WEB_APP_URL), env), true));
test('host and forwarded headers cannot authorize a foreign origin', () => assert.equal(mutationOriginAllowed(req('https://attacker.test'), env), false));
test('production rejects missing origin', () => assert.equal(mutationOriginAllowed(req(), env), false));
test('invalid or insecure canonical origin fails closed', () => {
  for (const value of ['bad', 'http://app.fasalguard.test', 'https://user:secret@app.fasalguard.test'])
    assert.equal(mutationOriginAllowed(req(env.WEB_APP_URL), { ...env, WEB_APP_URL: value }), false);
});
test('local development retains exact incoming-host support', () => assert.equal(mutationOriginAllowed(req('http://web:3000'), { NODE_ENV: 'development' }), true));
