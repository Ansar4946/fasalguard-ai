#!/usr/bin/env bash
# Create deploy/oracle-free/.env from .env.template and fill the generated secrets with openssl.
# Secrets are written straight to the file (mode 600) and are NEVER printed.
# Usage: scripts/gen-secrets.sh [--domain farm.example.com] [--email you@example.com] [--rotate]
#   --rotate  regenerate secrets that are already set (this logs everyone out and breaks the DB
#             login until you also change the Postgres role password - normally do NOT use it).
set -euo pipefail
umask 077

kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="$kit_dir/.env.template"
env_file="$kit_dir/.env"
domain=""
email=""
rotate=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) domain="${2:-}"; shift 2 ;;
    --email) email="${2:-}"; shift 2 ;;
    --rotate) rotate=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
[ -f "$template" ] || { echo "Missing $template" >&2; exit 1; }

if [ ! -f "$env_file" ]; then
  cp "$template" "$env_file"
  echo "Created $env_file from template."
fi
chmod 600 "$env_file"

# Current value of KEY (empty if unset). Values never contain newlines.
get_var() { sed -n "s/^$1=//p" "$env_file" | head -n 1; }

# Replace the whole "KEY=..." line. Only used with hex or validated simple values.
set_var() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$env_file.XXXXXX")"
  awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$env_file" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$env_file"
}

fill_secret() {
  local key="$1" bytes="$2"
  if [ -z "$(get_var "$key")" ] || [ "$rotate" -eq 1 ]; then
    set_var "$key" "$(openssl rand -hex "$bytes")"
    echo "  generated $key"
  else
    echo "  kept existing $key"
  fi
}

echo "Filling secrets (values are not shown):"
fill_secret POSTGRES_PASSWORD 24      # 48 hex chars
fill_secret REDIS_PASSWORD 24         # 48 hex chars
fill_secret JWT_ACCESS_SECRET 48      # 96 hex chars (>= 48 required in production)
fill_secret INTERNAL_SERVICE_TOKEN 32 # 64 hex chars (>= 32 required)
fill_secret METRICS_TOKEN 32
fill_secret USSD_CALLBACK_SECRET 32

if [ -n "$domain" ]; then
  case "$domain" in
    *[!A-Za-z0-9.-]*) echo "Invalid --domain (use e.g. farm.example.com, no scheme)" >&2; exit 2 ;;
  esac
  set_var DOMAIN "$domain"
fi
if [ -n "$email" ]; then
  case "$email" in
    *[!A-Za-z0-9._@+-]*) echo "Invalid --email" >&2; exit 2 ;;
  esac
  set_var ACME_EMAIL "$email"
fi

echo
echo "Done. File: $env_file (mode $(stat -c '%a' "$env_file" 2>/dev/null || echo 600))."
missing=""
for key in DOMAIN; do
  [ -n "$(get_var "$key")" ] || missing="$missing $key"
done
if [ -n "$missing" ]; then echo "Still to fill in by hand:$missing"; fi
echo "Provider keys (Gemini, SMTP, ...) are NOT generated: edit the file with nano, never paste them in chat."
