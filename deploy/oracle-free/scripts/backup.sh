#!/usr/bin/env bash
# Back up PostgreSQL (custom-format pg_dump) and the media volume (tar.gz) into BACKUP_DIR, keep the
# newest BACKUP_KEEP_DAYS days (default 7). Safe to run while the stack is up.
#
# Cron (daily 02:30 as the deploy user; edit the path to match your clone):
#   30 2 * * * /home/deploy/fasalguard-ai/deploy/oracle-free/scripts/backup.sh >>/var/log/fasalguard-backup.log 2>&1
#   (create the log first: sudo touch /var/log/fasalguard-backup.log && sudo chown deploy /var/log/fasalguard-backup.log)
#
# RESTORE (database) - this REPLACES the current data; stop the app first:
#   cd deploy/oracle-free
#   docker compose stop web api worker platform-api platform-worker platform-beat
#   docker compose exec -T postgres dropdb -U fasalguard --if-exists fasalguard
#   docker compose exec -T postgres createdb -U fasalguard fasalguard
#   docker compose exec -T postgres pg_restore -U fasalguard -d fasalguard --no-owner < /var/backups/fasalguard/db-YYYYmmdd-HHMMSS.dump
#   docker compose up -d
# RESTORE (media):
#   docker compose stop api worker platform-api platform-worker platform-beat
#   docker run --rm -v fasalguard-oracle_media_data:/data -v /var/backups/fasalguard:/backup:ro node:22-alpine \
#     sh -c 'rm -rf /data/* && tar xzf /backup/media-YYYYmmdd-HHMMSS.tar.gz -C /data && chown -R 1000:1000 /data'
#   docker compose up -d
# Off-box copy matters: a backup that lives only on this VM dies with the VM. See the guide.
set -euo pipefail
umask 077

kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$kit_dir"

get_var() { sed -n "s/^$1=//p" .env 2>/dev/null | head -n 1; }
backup_dir="${BACKUP_DIR:-$(get_var BACKUP_DIR)}"
backup_dir="${backup_dir:-/var/backups/fasalguard}"
keep_days="${BACKUP_KEEP_DAYS:-$(get_var BACKUP_KEEP_DAYS)}"
keep_days="${keep_days:-7}"
project="fasalguard-oracle"
stamp="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$backup_dir"
dc() { docker compose --env-file .env -f docker-compose.yml "$@"; }

echo "[$(date -Is)] backup start -> $backup_dir"

db_file="$backup_dir/db-$stamp.dump"
dc exec -T postgres pg_dump -U fasalguard -d fasalguard -Fc >"$db_file.partial"
# Verify the archive is readable before keeping it.
dc exec -T postgres pg_restore --list <"$db_file.partial" >/dev/null
mv "$db_file.partial" "$db_file"
echo "  database: $(basename "$db_file") ($(du -h "$db_file" | cut -f1))"

media_file="$backup_dir/media-$stamp.tar.gz"
docker run --rm -v "${project}_media_data:/data:ro" -v "$backup_dir:/backup" node:22-alpine \
  sh -c "tar czf /backup/media-$stamp.tar.gz.partial -C /data . && mv /backup/media-$stamp.tar.gz.partial /backup/media-$stamp.tar.gz"
echo "  media:    $(basename "$media_file") ($(du -h "$media_file" | cut -f1))"

find "$backup_dir" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' -o -name '*.partial' \) \
  -mtime "+$((keep_days - 1))" -print -delete | sed 's/^/  pruned: /'

echo "[$(date -Is)] backup done"
