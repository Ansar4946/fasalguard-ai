#!/bin/sh
# QA6: API (non-production) on :4046 + web (next start of existing production build) on :3046.
R="$(cd "$(dirname "$0")/../../.." && pwd)"
L="$R/docs/qa/qa6-logs"
export NODE_OPTIONS=--max-old-space-size=1536
cd "$R/services/api"
NODE_ENV=development PORT=4046 DATABASE_URL=postgres://postgres:${QA6_PG:-qa6pw}@localhost:55446/qa6c REDIS_URL=redis://localhost:56446 \
 JWT_ACCESS_SECRET=qa6-jwt-secret-for-local-testing-0123456789 JWT_ISSUER=fasalguard-api JWT_AUDIENCE=fasalguard-clients \
 CORS_ORIGINS=http://localhost:3046 WEB_APP_URL=http://localhost:3046 OTP_PROVIDER=development LOG_LEVEL=warn \
 nohup node dist/main.js > "$L/api.log" 2>&1 &
echo $! > "$L/api.pid"
cd "$R"
# NODE_ENV=production is required for `next start` of a production build; WEB_APP_URL is deliberately unset so the
# origin policy falls back to same-origin (http) instead of requiring https.
NODE_ENV=production PORT=3046 FASALGUARD_API_URL=http://localhost:4046/api/v1 nohup node node_modules/next/dist/bin/next start -p 3046 > "$L/web.log" 2>&1 &
echo $! > "$L/web.pid"
