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
