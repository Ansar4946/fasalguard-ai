#!/usr/bin/env bash
# Build (or pull) images, back up, run database migrations, start the stack and wait until healthy.
# Run on the VM from anywhere:  deploy/oracle-free/scripts/deploy.sh [options]
#   --no-build        do not build; use images already present (or pulled with --pull)
#   --pull            docker compose pull instead of build (needs IMAGE_REGISTRY images, see guide)
#   --no-backup       skip the pre-migration database backup
#   --skip-migrate    do not run migrations
#   --timeout SECONDS how long to wait for health (default 600)
set -euo pipefail

kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$kit_dir"

do_build=1
do_pull=0
do_backup=1
do_migrate=1
timeout_s=600

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-build) do_build=0; shift ;;
    --pull) do_pull=1; do_build=0; shift ;;
    --no-backup) do_backup=0; shift ;;
    --skip-migrate) do_migrate=0; shift ;;
    --timeout) timeout_s="${2:-600}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f .env ] || { echo "Missing $kit_dir/.env - run scripts/gen-secrets.sh first." >&2; exit 1; }
perm="$(stat -c '%a' .env)"
if [ "$perm" != "600" ] && [ "$perm" != "400" ]; then
  echo "Refusing to continue: .env permissions are $perm (expected 600). Run: chmod 600 .env" >&2
  exit 1
fi

# Report only the NAMES of required variables that are empty.
get_var() { sed -n "s/^$1=//p" .env | head -n 1; }
missing=""
for key in DOMAIN POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET INTERNAL_SERVICE_TOKEN; do
  [ -n "$(get_var "$key")" ] || missing="$missing $key"
done
if [ -n "$missing" ]; then echo "Empty required variables in .env:$missing" >&2; exit 1; fi
if [ "$(get_var JWT_ACCESS_SECRET | wc -c)" -lt 49 ]; then
  echo "JWT_ACCESS_SECRET is shorter than 48 characters." >&2; exit 1
fi
if [ "$(get_var INTERNAL_SERVICE_TOKEN | wc -c)" -lt 33 ]; then
  echo "INTERNAL_SERVICE_TOKEN is shorter than 32 characters." >&2; exit 1
fi
if [ "$(get_var USSD_ENABLED)" = "true" ] || [ "$(get_var USSD_DEMO_ENABLED)" = "true" ]; then
  echo "USSD_ENABLED / USSD_DEMO_ENABLED must be false for this kit." >&2; exit 1
fi

dc() { docker compose --env-file .env -f docker-compose.yml "$@"; }

echo "==> Validating compose file"
dc config -q

if [ "$do_pull" -eq 1 ]; then
  echo "==> Pulling images"
  dc pull
elif [ "$do_build" -eq 1 ]; then
  echo "==> Building images for $(uname -m) (first build on A1 takes 20-40 minutes; swap is used)"
  # Build one service at a time to keep peak memory low.
  for svc in api worker platform-api geospatial-ai web; do
    echo "--- building $svc"
    dc build "$svc"
  done
fi

echo "==> Starting data stores"
dc up -d --wait postgres redis

if [ "$do_backup" -eq 1 ] && [ "$do_migrate" -eq 1 ]; then
  if dc exec -T postgres psql -U fasalguard -d fasalguard -tAc "SELECT to_regclass('public.typeorm_migrations') IS NOT NULL" 2>/dev/null | grep -q t; then
    echo "==> Pre-migration backup"
    "$kit_dir/scripts/backup.sh"
  else
    echo "==> Fresh database: no pre-migration backup needed"
  fi
fi

if [ "$do_migrate" -eq 1 ]; then
  echo "==> Running migrations (one-shot)"
  dc --profile migration run --rm migrate
fi

echo "==> Starting the full stack"
dc up -d --remove-orphans

echo "==> Waiting up to ${timeout_s}s for healthy services"
services="postgres redis api worker platform-api platform-worker platform-beat geospatial-ai web caddy"
deadline=$(( $(date +%s) + timeout_s ))
while :; do
  pending=""
  for svc in $services; do
    cid="$(dc ps -q "$svc" 2>/dev/null || true)"
    if [ -z "$cid" ]; then pending="$pending $svc(not-created)"; continue; fi
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
    case "$status" in
      healthy|running) ;;
      *) pending="$pending $svc($status)" ;;
    esac
  done
  if [ -z "$pending" ]; then break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "TIMEOUT. Not healthy:$pending" >&2
    echo "Inspect with: docker compose logs --tail=80 <service>" >&2
    exit 1
  fi
  sleep 5
done

echo
dc ps
echo
echo "Stack is healthy. Next: scripts/smoke-test.sh"
