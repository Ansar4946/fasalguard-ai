#!/bin/sh
# QA6: (re)start only the API on :4046. Usage: start-api.sh [RATE_LIMIT_PER_MINUTE]
R="$(cd "$(dirname "$0")/../../.." && pwd)"; L="$R/docs/qa/qa6-logs"
[ -f "$L/api.pid" ] && taskkill //F //PID "$(cat "$L/api.pid")" >/dev/null 2>&1
for p in $(netstat -ano | grep ":4046 .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //F //PID $p >/dev/null 2>&1; done
sleep 2
export NODE_OPTIONS=--max-old-space-size=1536
cd "$R/services/api"
NODE_ENV=development PORT=4046 DATABASE_URL=postgres://postgres:${QA6_PG:-qa6pw}@localhost:55446/qa6c REDIS_URL=redis://localhost:56446 \
 JWT_ACCESS_SECRET=qa6-jwt-secret-for-local-testing-0123456789 JWT_ISSUER=fasalguard-api JWT_AUDIENCE=fasalguard-clients \
 CORS_ORIGINS=http://localhost:3046 WEB_APP_URL=http://localhost:3046 OTP_PROVIDER=development LOG_LEVEL=warn \
 RATE_LIMIT_PER_MINUTE=${1:-120} nohup node dist/main.js > "$L/api-$(date +%s).log" 2>&1 &
echo $! > "$L/api.pid"
