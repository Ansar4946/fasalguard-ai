# F04 verification commands

Executed on 2026-10-14 against source in the D: project. Logs retain actual process exit codes.
Commands below are the arguments executed inside isolated dependency/test images; configuration
was synthetic and is intentionally omitted. No production database, container or volume was reset.

## Python — `services/platform-api`

```sh
ruff check app/weather tests/weather
python -m pytest tests -m "not integration" -q
python -m pytest tests/weather/test_integration.py -m integration -q
```

The unit subprocess uses the existing unit-test JWT fixture secret; integration uses a separate
synthetic test signing key. Do not run unit auth tests with a real deployment signing key.
Integration tests guard the disposable database names `f03_test` / `f03_runtime_test`; they reuse
the established synthetic identity fixture. Provider and failure cases are mocked there.
The Redis expiry integration test uses unique `test:f04:<uuid>:` keys and deletes only its own keys.

## Existing Nest API — `services/api`

```sh
npm run typecheck
npm test -- --runInBand
npm run build
npm run lint
npm run migration:run
npm run migration:revert
npm run migration:run
```

Migration rollback/reapply targeted only disposable `f03_test`; runtime test upgrade used
`f03_runtime_test`. Migration39 was confirmed as the migration reverted and reapplied.
Do not copy rollback commands to a deployed database without a separate deployment plan.

## Web — project root

```sh
npx tsc --noEmit
npx eslint components/intelligence/weather-intelligence.tsx components/dashboard/dashboard-weather.tsx features/weather 'app/api/fields/[id]/weather'
npx next build
node --test tests/weather/forecast-utils.test.cjs
```

The source snapshot was built in the existing web dependency image, with environment files,
services, `.git`, node_modules and provider credential directories excluded from copying.
Preview: isolated `fasalguard-f04-web`, localhost port13004; weather cutover flag true.
The actual deployed stack on port3000 was unchanged.

## Real browser/API/data workflow

```sh
# In the guarded disposable Python environment only:
python -m tests.weather.browser_fixture
python -m tests.weather.live_evidence reset
# In the isolated Playwright browser environment, after checking HTTP readiness:
NODE_PATH=/app/node_modules node /tmp/f04-weather-live.cjs
# Back in the guarded Python environment:
python -m tests.weather.live_evidence verify
```

The browser script is `tests/e2e/weather-live.cjs`, copied to `/tmp` in the browser environment.
Private fixture tokens are copied privately to `/tmp/f04-browser-fixture.json`; never print or
commit them. The browser script's default base URL is the isolated F04 web service. `reset`
asserts the disposable database and synthetic field name before deleting only that field's
forecast and its isolated F04 provider-cache cell. Successful browser stdout was exit0, and its
JSON/PNG artifacts were copied from `/tmp` into this evidence directory. Database verification
matched the same field and retrieval timestamp. Failure/expiry browser fixtures are explicitly
synthetic and are not saved as genuine weather data.

## Compose — validation only

```sh
docker compose --env-file <synthetic-test-settings> -f compose.platform.yml config --quiet
```

Exit0. Explicit synthetic settings replaced automatic `.env` loading. No compose deployment,
volume deletion, system prune or production resource modification was performed.
