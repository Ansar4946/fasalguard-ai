// Run with the project's TypeScript dependency: node --test tests/weather/forecast-utils.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../features/weather/forecast-utils.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const loaded = new Module(filename, module);
loaded._compile(compiled.outputText, filename);
const { groupHourlyByDay, forecastDays, pointCondition, conditionLabel } = loaded.exports;

test('missing rain stays unknown', () => {
  assert.equal(pointCondition({ precipitationProbabilityPercent: null, precipitationMm: null }), 'unknown');
  assert.equal(conditionLabel('unknown'), 'Not available');
});

test('rain condition threshold boundaries', () => {
  for (const [probability, mm, expected] of [[0, 0, 'clear'], [30, 0, 'chance-of-rain'], [60, 0, 'rain-likely'], [null, 2, 'rain-likely']])
    assert.equal(pointCondition({ precipitationProbabilityPercent: probability, precipitationMm: mm }), expected);
});

test('hourly fallback uses Pakistan calendar dates rather than browser timezone', () => {
  process.env.TZ = 'America/New_York';
  const days = groupHourlyByDay([{ time: '2026-10-13T20:00:00Z', temperatureC: 25, precipitationMm: 1 }]);
  assert.equal(days[0].key, '2026-10-14');
  assert.equal(days[0].highC, 25);
});

test('provider daily aggregate takes precedence over partial hourly values', () => {
  const daily = [{ key: '2026-10-14', highC: 35, lowC: 20, totalPrecipitationMm: null, maxWindKph: 20, maxRainProbabilityPercent: null }];
  const days = forecastDays({ daily, hourly: [{ time: '2026-10-14T10:00:00Z', temperatureC: 25, precipitationMm: 10, relativeHumidityPercent: 75 }] });
  assert.equal(days[0].highC, 35);
  assert.equal(days[0].avgHumidityPercent, 75);
  assert.equal(days[0].totalPrecipitationMm, null);
  assert.equal(days[0].condition, 'unknown');
});

test('invalid timestamps and nonfinite measurements cannot produce numbers', () => {
  assert.deepEqual(groupHourlyByDay([{ time: 'bad' }]), []);
  assert.equal(groupHourlyByDay([{ time: '2026-10-14T10:00:00Z', temperatureC: NaN }])[0].highC, null);
});

test('legacy fixed-offset provider metadata cannot crash Intl formatting', () => {
  assert.equal(loaded.exports.weatherTimezone('UTC+5'), 'Asia/Karachi');
  assert.equal(loaded.exports.weatherTimezone('Asia/Karachi'), 'Asia/Karachi');
});
