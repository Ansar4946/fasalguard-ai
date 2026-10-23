# Live deployment notes (Oracle Cloud, pilot release)

Deployed 2026-10-17. This file records what was actually done. It contains no secrets.

## What is running

- Public address: https://130-210-54-117.sslip.io (free `sslip.io` name that points at the server IP; Let's Encrypt certificate issued by Caddy).
- Server: Oracle Cloud, Mumbai, Ubuntu 24.04 (x86_64), 1 OCPU / 16 GB (shape VM.Standard.E3.Flex, a paid shape that uses trial credits), boot volume about 45 GB.
- Public IP 130.210.54.117 (ephemeral). If the instance is stopped and started the IP may change; reserve it in the Oracle console and re-point DNS.
- Ten containers (Docker Compose project `fasalguard-oracle`): caddy, web, api, worker, platform-api, platform-worker, platform-beat, geospatial-ai, postgres, redis.
- Kit: `deploy/oracle-free/` on the server at `/home/deploy/fasalguard/deploy/oracle-free/`. Settings file `.env` (mode 600) lives only on the server.
- Database: PostgreSQL + PostGIS, 45 migrations applied. Fresh and empty (no users).

## Verified on the live site

`scripts/smoke-test.sh`: 18 of 18 checks passed (TLS, redirect, health and readiness, security headers, CSP, 401 for anonymous, register, login, `/auth/me`, wrong password refused). A photo upload (presign, PUT, complete) over HTTPS also worked. Throw-away test users were deleted afterwards.

## Pilot mode (read this)

The API, worker and platform services run with `API_NODE_ENV=development` because production mode requires Alibaba OSS storage and TLS to Postgres and Redis. The production guards in `services/api/src/config/environment.ts` are therefore NOT enforced here. Manual safeguards are set instead: Swagger off, USSD demo off, HTTPS URLs, generated 96-hex JWT secret, internal service token, `TRUST_PROXY=1`, Redis password, internal-only database network. Do not store real farmer data until production mode is reached.

## Providers on this server

- Speech-to-text: AssemblyAI (key present). Text-to-speech: browser voices only (`SPEECH_PROVIDER=fake`).
- Assistant and Farm Brain: stub (`fake`). A valid Gemini key is not available. Put a new key in `.env` (`GEMINI_API_KEY`, `ASSISTANT_PROVIDER=gemini`, `FARM_BRAIN_PROVIDER=gemini`) and restart the api and worker.
- Crop vision: Roboflow. Satellite: legacy Sentinel Hub path (`SATELLITE_PLATFORM_ENABLED=false`); recent scans of the test field were cloud-blocked. Market: AMIS sync on, but the AMIS site did not answer earlier from the test machine.
- Push: Firebase (service account present, no real device test done). SMS and USSD gateway: not available; USSD is off.

## Everyday commands (run as `deploy` on the server)

```bash
cd ~/fasalguard/deploy/oracle-free
docker compose --env-file .env ps                      # status
docker compose --env-file .env logs --tail=80 api      # logs for one service
./scripts/smoke-test.sh                                # health and sign-in checks
./scripts/backup.sh                                    # database + media backup
./scripts/deploy.sh --no-backup                        # rebuild and restart after copying new code
```

Update `.env` with `nano .env`, then `docker compose --env-file .env up -d <service>`.

## First admin account

There is no admin sign-up. Register a normal account on the site, then promote it on the server:

```bash
docker exec -it fasalguard-oracle-postgres-1 psql -U fasalguard -d fasalguard \
  -c "update users set role='ADMIN' where email='YOUR_EMAIL';"
```

(The role name must match `UserRole` in `services/api/src/domain/identity/identity.enums.ts`.)

## Open items

1. Check Oracle Billing > Free trial credits: the E3.Flex server is not covered by Always Free.
2. Set up backups on a schedule (cron line is in `FREE_DEPLOY_ORACLE.md`) and copy them off the server.
3. Real Gemini key, SMTP check (registration emails), push test on a device.
4. Production mode needs Alibaba OSS (or a code change for another store) plus Postgres and Redis TLS.
5. Disk is about 45 GB, not the 150 GB planned; resize the boot volume in the Oracle console if images and data grow.

## Update 2026-10-23: Dawai Check and the Urdu voice assistant deployed

Deployed from `master` (commit 443f0ae). Steps taken: database backup, new code copied from `git archive`, server `.env` updated, `deploy.sh` (builds, migrations 047 and 048, restart), then the seeds were run inside the API container.

- **New settings on the server:** `ASSISTANT_PROVIDER=extractive`, `DAWAI_CHECK_ENABLED=true`, `LABEL_READER_PROVIDER=tesseract`, `LABEL_OCR_LANGS=eng`, `NEXT_PUBLIC_DAWAI_CHECK_ENABLED=true` and `NEXT_PUBLIC_VOICE_ASSISTANT_ENABLED=true` (the two NEXT_PUBLIC values are baked into the web image at build time).
- **Reference data loaded (live):** 26 banned DPP ingredients, 9 banned pre-mixture brands, 139 notified Form-16 products, 20 demo catalogue products, 24 demo knowledge articles (all labelled `DEMO - not expert-reviewed`).
- **Seed commands (re-runnable):**
  ```bash
  cd ~/fasalguard/deploy/oracle-free
  docker compose --env-file .env exec -T api node dist/domain/pesticide-check/pesticide-seed.cli.js
  docker compose --env-file .env exec -T api node dist/domain/assistant/demo-knowledge-seed.cli.js
  ```
- **Smoke test:** all checks passed. Live Dawai Check photo tests over HTTPS: DPP-notified label VERIFIED (WHO class III), banned pre-mixture Ammo-phos HIGH_RISK (SRO 624(I)/96), Endosulfan HIGH_RISK (S.R.O. 1329(I)/2012), unknown ingredient SUSPICIOUS ("could not confirm"). Live assistant: Urdu rice, English wheat and Urdu wheat questions cite their own DEMO article; an off-topic question abstains; an account question answers from the user's own data.
- **Deploy-kit fix:** the platform-api and geospatial-ai Dockerfiles now strip Windows line endings from `requirements.txt` before the rasterio bump (a CRLF checkout made the first attempt fail).
- **Still true:** pilot mode (API production guards off), the assistant is quote-only (no model key), the DPP notified list is partial and from 2005 (not found does not mean unregistered), usage terms of the DPP lists are unverified, OCR is proven on generated labels only.
