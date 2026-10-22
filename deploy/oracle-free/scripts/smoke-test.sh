#!/usr/bin/env bash
# Black-box smoke test against the PUBLIC https URL. Creates ONE new throw-away FARMER account through
# the register endpoint (use --no-register to skip). Prints PASS/FAIL per check, exits 1 on any FAIL.
# Usage: scripts/smoke-test.sh [--domain farm.example.com] [--no-register]
# Env:   SMOKE_EMAIL  address for the throw-away account (default smoke-<ts>@example.invalid; the API
#                     e-mails the credentials to it when SMTP is configured, so pick one you control
#                     if you do not want a bounce).
set -uo pipefail

kit_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
domain=""
do_register=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) domain="${2:-}"; shift 2 ;;
    --no-register) do_register=0; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$domain" ] && [ -f "$kit_dir/.env" ]; then
  domain="$(sed -n 's/^DOMAIN=//p' "$kit_dir/.env" | head -n 1)"
fi
[ -n "$domain" ] || { echo "Pass --domain or set DOMAIN in .env" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

base="https://$domain"
fails=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1${2:+ -- $2}"; fails=$((fails + 1)); }
status_of() { curl -sS -o "$tmp/body" -w '%{http_code}' --max-time 30 "$@" 2>"$tmp/err" || echo "000"; }

# 1. TLS valid: no -k, so curl verifies chain and hostname against the system CA store.
code="$(status_of "$base/api/health")"
if [ "$code" = "200" ]; then pass "TLS certificate valid and web /api/health returns 200"
else fail "TLS / web health" "HTTP $code $(tr -d '\n' <"$tmp/err")"; fi
grep -q '"status":"ok"' "$tmp/body" 2>/dev/null || fail "web health body" "no status ok"

if command -v openssl >/dev/null 2>&1; then
  cert="$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 2>/dev/null)"
  if [ -n "$cert" ] && printf '%s\n' "$cert" | openssl x509 -checkend 604800 -noout >/dev/null 2>&1; then
    end="$(printf '%s\n' "$cert" | openssl x509 -noout -enddate | sed 's/notAfter=//')"
    pass "certificate valid for at least 7 more days (expires: $end)"
  else fail "certificate expiry" "could not read the certificate or it expires within 7 days"; fi
fi

# 2. HTTP redirects to HTTPS.
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "http://$domain/" 2>/dev/null || echo 000)"
case "$code" in 301|302|307|308) pass "http:// redirects to https ($code)" ;; *) fail "HTTP->HTTPS redirect" "HTTP $code" ;; esac

# 3. Core API liveness and readiness through the proxy.
code="$(status_of "$base/api/v1/health")"
if [ "$code" = "200" ]; then pass "core API /api/v1/health 200"; else fail "core API health" "HTTP $code"; fi
code="$(status_of "$base/api/v1/ready")"
if [ "$code" = "200" ]; then pass "core API /api/v1/ready 200 (database, PostGIS, Redis, storage up)"
else fail "core API ready" "HTTP $code $(head -c 300 "$tmp/body")"; fi

# 4. Security headers and CSP on the web app.
curl -sS -D "$tmp/headers" -o /dev/null --max-time 30 "$base/" 2>/dev/null || true
hdr() { grep -i "^$1:" "$tmp/headers" | head -n 1 | tr -d '\r'; }
for name in strict-transport-security x-content-type-options x-frame-options referrer-policy content-security-policy permissions-policy; do
  if [ -n "$(hdr "$name")" ]; then pass "header present: $name"; else fail "missing header" "$name"; fi
done
csp="$(hdr content-security-policy)"
case "$csp" in
  *"connect-src 'self' https://$domain"*) pass "CSP connect-src contains the storage origin https://$domain" ;;
  *) fail "CSP storage origin" "connect-src lacks https://$domain (STORAGE_UPLOAD_ORIGINS must be set at BUILD time; rebuild web)" ;;
esac
case "$csp" in *"frame-ancestors 'none'"*) pass "CSP frame-ancestors 'none'" ;; *) fail "CSP frame-ancestors" ;; esac
if [ -n "$(hdr server)" ] && printf '%s' "$(hdr server)" | grep -qi 'caddy'; then fail "Server header leaks software" "$(hdr server)"; fi

# 5. Unauthenticated access to a protected API route must be 401.
code="$(status_of "$base/api/v1/farms")"
if [ "$code" = "401" ]; then pass "unauthenticated GET /api/v1/farms -> 401"; else fail "unauthenticated farm route" "HTTP $code (expected 401)"; fi

# 6. Register a NEW user, log in, wrong password refused.
if [ "$do_register" -eq 1 ]; then
  stamp="$(date +%s)"
  email="${SMOKE_EMAIL:-smoke-$stamp@example.invalid}"
  if command -v openssl >/dev/null 2>&1; then password="Smoke-$(openssl rand -hex 12)"; else password="Smoke-$stamp-$RANDOM$RANDOM$RANDOM"; fi
  device="smoke-test-device-$stamp"
  reg_body="$(printf '{"email":"%s","password":"%s","fullName":"Smoke Test","preferredLanguage":"en","consents":[{"type":"LOCATION_PROCESSING","policyVersion":"1","granted":true}],"device":{"deviceIdentifier":"%s","platform":"web"}}' "$email" "$password" "$device")"
  code="$(status_of -X POST -H 'content-type: application/json' --data "$reg_body" "$base/api/v1/auth/register")"
  if [ "$code" = "201" ] || [ "$code" = "200" ]; then pass "register new user ($code)"
  else fail "register" "HTTP $code $(head -c 300 "$tmp/body")"; fi

  login_body="$(printf '{"identifier":"%s","password":"%s","device":{"deviceIdentifier":"%s","platform":"web"}}' "$email" "$password" "$device")"
  code="$(status_of -X POST -H 'content-type: application/json' --data "$login_body" "$base/api/v1/auth/login")"
  if [ "$code" = "200" ] && grep -q '"accessToken"' "$tmp/body"; then
    pass "login with correct password ($code)"
    token="$(sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p' "$tmp/body" | head -n 1)"
    if [ -n "$token" ]; then
      code="$(status_of -H "authorization: Bearer $token" "$base/api/v1/auth/me")"
      if [ "$code" = "200" ]; then pass "authenticated /auth/me ($code)"; else fail "authenticated /auth/me" "HTTP $code"; fi
    fi
  else fail "login" "HTTP $code"; fi

  bad_body="$(printf '{"identifier":"%s","password":"%s","device":{"deviceIdentifier":"%s","platform":"web"}}' "$email" "Wrong-$password-x" "$device")"
  code="$(status_of -X POST -H 'content-type: application/json' --data "$bad_body" "$base/api/v1/auth/login")"
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then pass "wrong password refused ($code)"; else fail "wrong password" "HTTP $code (expected 401)"; fi
  echo "NOTE  throw-away account created: $email (delete it from the database when finished)"
fi

echo
if [ "$fails" -eq 0 ]; then echo "SMOKE TEST: all checks passed"; exit 0; fi
echo "SMOKE TEST: $fails check(s) FAILED"
exit 1
