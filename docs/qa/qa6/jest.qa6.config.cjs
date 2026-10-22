// QA6 override: identical to services/api/jest.config.cjs but ts-jest isolatedModules (no per-file type-check)
// so AppModule bootstrap fits inside the specs' hard-coded 30 s beforeAll on a memory-constrained host.
const path = require('path');
const base = require('../../../services/api/jest.config.cjs');
module.exports = { ...base, rootDir: path.resolve(__dirname, '../../../services/api'),
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true, diagnostics: false }] } };
