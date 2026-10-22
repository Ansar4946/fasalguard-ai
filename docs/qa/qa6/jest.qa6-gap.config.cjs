const base = require('./jest.qa6.config.cjs');
module.exports = { ...base, setupFilesAfterEnv: [require('path').resolve(__dirname, 'throttle-gap.setup.cjs')] };
