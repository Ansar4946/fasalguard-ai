#!/bin/sh
# QA6: run every *.integration-spec.ts one at a time against disposable qa6-pg (port 55446) / qa6-redis (56446).
# Gated specs need their own database name (f07_test etc.), cloned from the migrated qa6 DB via CREATE DATABASE ... TEMPLATE.
cd "$(dirname "$0")/../../../services/api" || exit 1
export NODE_OPTIONS=--max-old-space-size=3072 REDIS_URL=redis://localhost:56446
B=postgres://postgres:${QA6_PG:-qa6pw}@localhost:55446
export DATABASE_URL=$B/qa6
LOG=../../docs/qa/qa6-logs/integration; mkdir -p $LOG
for f in test/*.integration-spec.ts; do
  n=$(basename $f .integration-spec.ts)
  docker exec qa6-redis redis-cli flushall >/dev/null
  case $n in
    market|market-workflow) E="F07_TEST_DATABASE_URL=$B/f07_test";;
    voice-assistant) E="F08_TEST_DATABASE_URL=$B/f08_test";;
    farm-finance) E="F09_TEST_DATABASE_URL=$B/f09_test";;
    assistant-grounding) E="F10_TEST_DATABASE_URL=$B/f10_test";;
    notifications) E="F12_TEST_DATABASE_URL=$B/f12_test";;
    yield) E="YIELD_TEST_DATABASE_URL=$B/yield_test";;
    *) E="QA6_NONE=1";;
  esac
  env $E npx jest -c ../../docs/qa/qa6/jest.qa6.config.cjs --runInBand --forceExit --testRegex="$n\.integration-spec\.ts\$" > $LOG/$n.log 2>&1
  echo "$n exit=$? $(sed 's/\x1b\[[0-9;]*m//g' $LOG/$n.log | grep -E '^Tests:' )"
done
