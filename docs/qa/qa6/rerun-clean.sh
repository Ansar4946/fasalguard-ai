#!/bin/sh
# QA6: rerun the specs that failed on the shared DB, each on its own fresh clone of a freshly migrated DB (c_<name>).
cd "$(dirname "$0")/../../../services/api" || exit 1
export NODE_OPTIONS=--max-old-space-size=3072 REDIS_URL=redis://localhost:56446
LOG=../../docs/qa/qa6-logs/integration-clean; mkdir -p $LOG
for n in billing growth knowledge outbreak-geospatial; do
  d=c_$(echo $n | tr - _)
  docker exec qa6-redis redis-cli flushall >/dev/null
  DATABASE_URL=postgres://postgres:${QA6_PG:-qa6pw}@localhost:55446/$d npx jest -c ../../docs/qa/qa6/jest.qa6.config.cjs --runInBand --forceExit --testRegex="$n\.integration-spec\.ts\$" > $LOG/$n.log 2>&1
  echo "$n exit=$? $(sed 's/\x1b\[[0-9;]*m//g' $LOG/$n.log | grep -E '^Tests:')"
done
