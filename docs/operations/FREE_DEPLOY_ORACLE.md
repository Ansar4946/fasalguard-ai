# Free deployment on Oracle Cloud Always Free (single VM)

Audience: the project owner, not a DevOps engineer. Follow the steps in order. Every command is meant
to be copied as is. Text in `<angle brackets>` is for you to replace.

Kit location: `deploy/oracle-free/` (compose file, Caddy config, env template, scripts).

**Status of this kit: prepared and statically checked only. Nothing has been deployed, no Oracle
account was contacted, and no image has been built.** Section 23 lists every claim that is not yet
verified. Expect to fix small things on the first real run. Section 23 lists what is unverified.

## 0. Read this first: what "everything on one free VM" really means

1. **Pilot mode, not production mode.** The core API refuses to start with `NODE_ENV=production`
   unless uploads go to Alibaba OSS (`services/api/src/domain/media/media.module.ts`: local disk is
   "forbidden in production"). The platform service also requires TLS-verified Postgres and `rediss://`
   in production. A free VM has neither, so this kit runs the **web** in production mode and the
   **API, worker and platform services** in `development` mode (`API_NODE_ENV=development`). That
   turns off the strict startup checks in `services/api/src/config/environment.ts`; the kit
   compensates by setting the safe values itself (no Swagger, no demo USSD, no dev OTP, Firebase push,
   HTTPS URLs, strong secrets, no published database ports). It is a good pilot setup. It is **not**
   the audited production configuration.
   To reach real production mode later you need Alibaba OSS (or a code change to allow another store),
   Postgres and Redis with TLS, SMTP, a commercial Open-Meteo key, and valid AI keys. See section 16.
2. **One VM means no high availability.** If the VM, its disk or the region has a problem, the site is
   down until you fix or restore it. Backups on the same disk do not protect against losing the disk.
3. **Several features need keys you must supply** (section 14). The site runs without them, but those
   features show errors or empty states.

## 1. Architecture (what runs where)

```
Internet -> Oracle VCN firewall -> VM firewall -> Caddy (80, 443, automatic HTTPS)
                                                   |-- https://DOMAIN/            -> web (Next.js UI + BFF)
                                                   '-- https://DOMAIN/api/v1/*   -> api (NestJS)
internal Docker network only (no ports on the host):
   web -> api, platform-api      api/worker -> postgres, redis, geospatial-ai
   platform-api / platform-worker / platform-beat (FastAPI + Celery) -> postgres, redis
   geospatial-ai (vision, satellite maths, AMIS)      postgres (PostGIS 17)      redis 7.4
   volumes: pg_data, redis_data, media_data (uploads), caddy_data (certificates)
```

Why one domain with a `/api/v1` path instead of `api.DOMAIN`:

- Uploads (scan photos, voice notes) go straight from the browser to the API using a one-time signed
  URL built from `API_PUBLIC_URL=https://DOMAIN/api/v1`. That is the **same origin** as the page, so no
  CORS setup is needed and the page's Content-Security-Policy `connect-src 'self'` already allows it.
- One DNS record, one certificate.
- The platform service also uses `/api/v1`, so it is deliberately **not** public; the web app talks to it
  over the private network. If the mobile app needs it, add a `platform.DOMAIN` record and uncomment the
  block at the bottom of `Caddyfile`.
- `STORAGE_UPLOAD_ORIGINS` is a **build-time** web setting. The kit sets it to `https://DOMAIN` as a
  build argument (`deploy/oracle-free/docker/web.Dockerfile`). If you change the domain you must
  **rebuild the web image**. The smoke test checks the CSP contains it.

Memory limits (sum of steady-state limits about 13.6 GB, plus 0.75 GB while migrating): caddy 0.125,
web 1.5, api 1.5, worker 1, platform-api 1, platform-worker 2, platform-beat 0.25, geospatial-ai 2,
postgres 3, redis 1 GB. The rest of the 24 GB is left for Linux, the page cache and builds.

## 2. Costs and limits

- Always Free allows up to 4 Arm OCPU and 24 GB RAM in total across A1 instances, and 200 GB of block
  storage in total (boot volumes included). This kit uses one instance with 4 OCPU, 24 GB and a 100 GB boot
  volume.
- Outbound data: Always Free includes 10 TB per month. You will not get near it.
- **What can cost money if you exceed free limits** (only after upgrading, see below): more than 4 OCPU or
  24 GB of A1, more than 200 GB of block storage, extra boot/block volumes, load balancers other than
  the free one, extra public IPs that are reserved but not attached, outbound data above the allowance,
  and any paid service you click on. Create a budget alert: Billing and Cost Management, Budgets,
  amount 1 USD, alert at 1%.
- **The domain name is not free** (about 1 to 15 USD per year depending on the ending). You need one for
  automatic HTTPS. A free subdomain from a dynamic DNS service also works for a pilot.
- Provider keys (Gemini, SMTP, speech, commercial weather) have their own prices and free tiers.

### Idle reclamation and Pay As You Go (your choice)

Oracle states it can reclaim Always Free compute instances that stay idle (published criteria: over a
7-day window, 95th-percentile CPU below 20%, and for Arm shapes also memory below 20%). A quiet pilot
can look idle. Check Oracle's current "Always Free resources" page for the exact wording. Two options:

- Accept the risk and keep backups off the VM, so a reclaimed instance can be rebuilt in an hour.
- Upgrade the account to **Pay As You Go**. Always Free resources stay free after upgrading and, per
  Oracle's documentation, idle reclamation is not applied to upgraded accounts. Your card is charged
  only for usage above the free allowance, so set the budget alert above. This is your decision; the kit
  works either way.

## 3. Create the Oracle account

1. Go to oracle.com/cloud/free and sign up with your real name and address.
2. **Choose the home region carefully: it cannot be changed later**, and Always Free A1 capacity is
   per region. Pick a region close to your users that is not known to be perpetually full (search for
   recent "A1 capacity" reports for the candidate regions before choosing).
3. A credit or debit card is needed for identity verification. Oracle places a small temporary hold and
   does not charge you while you stay inside the free limits.
4. Wait for the confirmation e-mail, then sign in at cloud.oracle.com.

Never share your Oracle password, API keys, or private SSH key with anyone, including in chat.

## 4. Create the VM

1. Make an SSH key on your own computer (Windows PowerShell):
   `ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_fasalguard -C fasalguard`
   Keep `oracle_fasalguard` (private) secret. You will upload `oracle_fasalguard.pub` (public).
2. Console menu, Compute, Instances, **Create instance**.
3. Name: `fasalguard`. Placement: leave the default availability domain.
4. Image: Change image, Canonical Ubuntu, **24.04**, make sure it says aarch64/Arm.
5. Shape: Change shape, **Ampere**, `VM.Standard.A1.Flex`, **4 OCPU, 24 GB** memory. (If it fails, see
   "Out of capacity" in section 15; 2 OCPU / 12 GB still runs this stack but builds are slower.)
6. Networking: keep the default new VCN and public subnet, **Automatically assign public IPv4 address**
   ticked.
7. Add SSH keys: upload `oracle_fasalguard.pub`.
8. Boot volume: tick "Specify a custom boot volume size", enter **100** (GB).
9. Create. Wait until the state is Running and note the public IP.
10. **Reserve the IP so it never changes**: Networking, IP management, Reserved public IPs, Reserve
    public IP address (name `fasalguard-ip`). Then Compute, Instances, your instance, Attached VNICs,
    your VNIC, IPv4 Addresses, three dots, Edit: choose "No public IP", save, edit again and choose
    "Reserved public IP", pick `fasalguard-ip`. Your SSH session will drop; use the new address.

## 5. Open ports 80 and 443 in Oracle's network (VCN)

There are **two** firewalls and both must allow 80 and 443:

1. The Oracle VCN security list (this step; it lives in Oracle's cloud).
2. The VM's own firewall (done by `bootstrap-vm.sh`: ufw and iptables).

Exact steps: Console, Networking, Virtual cloud networks, click your VCN, **Security** tab,
click **Default Security List for ...**, **Security rules**, **Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination port | Description |
|---|---|---|---|
| 0.0.0.0/0 | TCP | 80 | HTTP (certificate challenge, redirect) |
| 0.0.0.0/0 | TCP | 443 | HTTPS |

Port 22 (SSH) is already there. For better safety change the 22 rule's source from 0.0.0.0/0 to your own
public IP/32. If you use a Network Security Group instead, add the same two rules there. Do not open
5432 (Postgres), 6379 (Redis), 4000, 3000 or 8000: the kit does not publish them anyway.

## 6. DNS

At your domain registrar create an **A record**: name `@` (or the subdomain, for example `farm`) pointing
to the reserved public IP, TTL 300. Check from your computer: `nslookup <domain>` shows the IP. Wait for
this before the first start, because Let's Encrypt needs it. Do not add an AAAA record unless you have set
up IPv6 on the VM.

## 7. Log in and prepare the VM

```bash
ssh -i ~/.ssh/oracle_fasalguard ubuntu@<public-ip>
```

Get the repository onto the VM (pick one):

- `git clone <your-private-repo-url> ~/fasalguard-ai` (create a read-only deploy key or token; never put it
  in a script), or
- from your Windows machine, copy only what is needed (run in Git Bash, inside the repo folder):
  `tar --exclude=node_modules --exclude=.git --exclude=.next --exclude='.env*' --exclude=mobile -czf /tmp/fg.tgz .`
  then `scp -i ~/.ssh/oracle_fasalguard /tmp/fg.tgz ubuntu@<public-ip>:~` and on the VM
  `mkdir -p ~/fasalguard-ai && tar xzf ~/fg.tgz -C ~/fasalguard-ai`.
  (Do not leave `.env` files in the copy. Note `deploy`, `services` and `app` folders must be included.)

Then bootstrap (installs Docker, 4 GB swap, firewall, automatic security updates, a `deploy` user):

```bash
cd ~/fasalguard-ai/deploy/oracle-free/scripts
sudo bash bootstrap-vm.sh --fail2ban
```

Log out, then log in as the new user (the keys were copied from `ubuntu`):
`ssh -i ~/.ssh/oracle_fasalguard deploy@<public-ip>`. Move the code if you used `ubuntu`:
`sudo cp -r /home/ubuntu/fasalguard-ai ~ && sudo chown -R deploy:deploy ~/fasalguard-ai`.
Check Docker: `docker run --rm hello-world` and `docker compose version`.

## 8. Secrets and settings

```bash
cd ~/fasalguard-ai/deploy/oracle-free
scripts/gen-secrets.sh --domain <your-domain> --email <you@example.com>
nano .env
```

`gen-secrets.sh` creates `.env` (permissions 600) and fills the database, Redis, JWT, internal and metrics
secrets with `openssl`. It never prints them. Then edit `.env` yourself for provider keys (section 14):
at minimum `GEMINI_API_KEY`, and `SMTP_*` so account e-mails are delivered. Rules:

- Never paste keys into chat, issues, or screenshots. Only edit them in `.env` on the VM.
- `.env` is ignored by git. Back it up somewhere private (password manager attachment): if you lose
  `POSTGRES_PASSWORD` or `JWT_ACCESS_SECRET` you cannot restore cleanly.
- The old Gmail app password and Gemini key committed to git history were flagged for rotation in
  `docs/qa/DEPLOYMENT_CHECKLIST.md`. Do not reuse them.

## 9. Build the images (long)

Images must be arm64. Building on the VM itself produces arm64 natively, no emulation.

```bash
cd ~/fasalguard-ai/deploy/oracle-free
scripts/deploy.sh          # builds one image at a time, migrates, starts everything, waits for health
```

Expect **20 to 45 minutes** the first time (npm install, `next build`, Python wheels). Swap prevents
out-of-memory kills. Run it inside `tmux` or `screen` (`sudo apt install tmux`) so a dropped SSH
connection does not kill it. If the build is killed ("exit 137"), run it again; Docker keeps finished layers.

Alternative: build on GitHub with QEMU/buildx using
`deploy/oracle-free/github-actions-build-arm64.yml.example` and pull on the VM (instructions are at the top of
that file). It is slower per build but keeps the VM free for traffic. Not run yet.

What the build changes compared with the repo's own Dockerfiles (so you know why `docker/` exists):

- `rasterio==1.4.3` has no Linux arm64 wheel, so `pip` would fail. The kit builds with `rasterio==1.4.4`
  (arm64 wheel exists) by editing the pin at build time. The repo files are untouched.
- `Dockerfile.web` has no way to set the CSP storage origin, so the kit adds a build argument.

## 10. Migrations and start (what `deploy.sh` does)

1. Validate the compose file. 2. Build. 3. Start Postgres and Redis. 4. If a database already exists, take a
backup. 5. `docker compose --profile migration run --rm migrate` (one-shot; runs all TypeORM migrations;
only one may run at a time). 6. `docker compose up -d`. 7. Wait until every service is healthy.

Manual equivalents (all from `deploy/oracle-free/`):

```bash
docker compose --profile migration run --rm migrate
docker compose up -d
docker compose ps
docker compose logs --tail=80 api
```

The first start requests the Let's Encrypt certificate. Watch it: `docker compose logs -f caddy`. If it fails,
the usual cause is DNS not pointing at the VM yet, or port 80/443 closed in the Oracle security list. Let's
Encrypt limits repeated failures, so fix the cause before retrying.

## 11. Smoke test

```bash
scripts/smoke-test.sh
```

It checks: valid TLS; HTTP to HTTPS redirect; web and API health; API readiness (database, PostGIS, Redis,
storage); security headers; the CSP `connect-src` includes `https://<domain>`; an unauthenticated farm route
returns 401; a **new** account can register and log in; a wrong password is refused. It creates one
throw-away FARMER account (`smoke-<time>@example.invalid`). Delete it afterwards:

```bash
echo "DELETE FROM users WHERE email LIKE 'smoke-%@example.invalid';" | docker compose exec -T postgres psql -U fasalguard -d fasalguard
```

(That may fail on related rows; if it does, leave the account, it has no privileges.) The test does not
cover scans, voice, satellite or the assistant; do the manual list in section 13.

## 12. First admin and expert accounts (safely)

There is no "create admin" endpoint. The safe path is: register normally in the browser (it enforces the
12-character password rule), then promote that user in the database from the VM. The password never leaves
you.

```bash
cd ~/fasalguard-ai/deploy/oracle-free
echo "UPDATE users SET role = :'newrole' WHERE lower(email) = lower(:'who') RETURNING id, email, role;" \
 | docker compose exec -T postgres psql -U fasalguard -d fasalguard -v newrole=AGRICULTURE_EXPERT -v who=expert@example.com
```

Roles: `AGRICULTURE_EXPERT` (expert review pages), `ADMIN` / `SUPER_ADMIN` (admin pages),
`GOVERNMENT_VIEWER`, `NGO_VIEWER`, `FIELD_WORKER`, `FARMER` (default). The person must log out and in again,
because the role is inside the login token. Keep admins to the minimum, use unique long passwords, and do
not share accounts. Note: the register endpoint e-mails the chosen password to the user's address
(`sendCredentials`); that is existing application behaviour. Tell users to change it, and consider
removing it in a code change.

## 13. First 30 minutes after go-live (checklist)

- [ ] `docker compose ps`: every service `healthy` (platform-beat and worker show `running` or `healthy`).
- [ ] `scripts/smoke-test.sh` all PASS.
- [ ] Open `https://<domain>` on a phone (mobile data, not your Wi-Fi): padlock shown, landing page loads.
- [ ] Register your own account, sign in, create a farm and a field, run a scan with a photo: confirms the
      upload (signed URL on the same domain) and worker processing.
- [ ] Record a voice note: confirms the microphone permission and upload.
- [ ] Weather page shows data for the field; satellite and market pages show real data or an honest
      empty state.
- [ ] Assistant answers (needs a valid Gemini key). A provider error here means the key, not the stack.
- [ ] Promote your own account to expert/admin (section 12) and open those pages.
- [ ] `sudo ufw status` shows only 22, 80, 443. From another network, `nmap` or an online port checker shows
      5432, 6379, 4000, 3000, 8000 closed.
- [ ] Run `scripts/backup.sh` once, check the two files exist, copy them off the VM, and test
      `pg_restore --list` on the dump.
- [ ] Add the cron line (section 18) and an uptime monitor (section 20).
- [ ] `free -h` and `docker stats --no-stream`: memory not near the limits; swap barely used.
- [ ] Save `.env` and the SSH private key in a password manager.
- [ ] Set the Oracle budget alert (section 2).

## 14. Features that will NOT work without extra credentials

| Feature | Needs | Without it |
|---|---|---|
| AI assistant, Farm Brain, investigations | A **valid** Gemini key (`GEMINI_API_KEY`); the key in older docs was invalid | Provider errors / no answers |
| Account e-mails (credentials, password setup) | SMTP account (`SMTP_HOST`, `SMTP_FROM`, ...) | Registration works, e-mail reports `failed` |
| Server-side text-to-speech and Urdu/Hindi speech | Azure Speech or Qwen key, or AssemblyAI for transcription | `SPEECH_PROVIDER=fake`: no real speech |
| Push notifications | Firebase service account (`FIREBASE_SERVICE_ACCOUNT_BASE64`) plus a real device test | In-app inbox works; no phone push |
| SMS / OTP | An SMS gateway. No adapter exists in the code | No SMS |
| USSD | A real gateway. Only the test-only `contract-test` adapter exists, so USSD is disabled | USSD not available |
| Crop disease: self-hosted model | Reviewed ONNX weights in `services/geospatial-ai/models` (not in the repo) | Honest "model unavailable" results |
| Crop disease: Roboflow | `ROBOFLOW_*` key and model ids | Same |
| Commercial weather | Open-Meteo customer key + `OPEN_METEO_BASE_URL=https://customer-api.open-meteo.com` | The free public endpoint is non-commercial use only |
| Satellite (legacy path) | Sentinel Hub client id/secret | Sample fallback or empty state |
| Satellite via platform | Set `SATELLITE_PLATFORM_ENABLED=true` (public data, no key); not field-verified | Off by default |
| Market prices (AMIS) | Operator permission, then `AMIS_SYNC_ENABLED=true` | Manual/empty market data |
| Billing | Stripe keys (all three) | Billing disabled |
| Offline sync (F06) | Blocked by the code until acceptance tests pass | Not available |

Known unverified items from the project's own QA are in `docs/qa/DEPLOYMENT_CHECKLIST.md` section 4.

## 15. Honest limits

- **Out of capacity.** Creating an A1.Flex instance often fails with "Out of host capacity" in popular
  regions. Retry at different times (early morning local time is best), try each availability domain, try
  2 OCPU / 12 GB first (you can resize up later), or retry in a loop with the OCI command-line tool. Do not
  create the account in another region on purpose: the home region is permanent.
- Single VM: no automatic failover, a reboot means a few minutes of downtime, updates cause brief restarts.
- Single disk: backups on the same disk do not protect against disk or instance loss. Copy them off the VM.
- The stack was never run on arm64 by this project. Treat the first week as a pilot.
- Rate limiting is per API process (in memory). Fine for one instance.
- Satellite, vision and irrigation workers are CPU heavy; heavy use will be slow on 4 Arm cores.

## 16. Pilot mode vs production mode (what blocks real production)

`environment.ts` production guards and what this kit does:

| Guard | Kit behaviour |
|---|---|
| `DATABASE_SSL=true` or `ALLOW_PLAINTEXT_DATABASE=true` | `DATABASE_SSL=false`, `ALLOW_PLAINTEXT_DATABASE=true`. Justification: Postgres is only on an `internal: true` Docker network, no host port, same VM. Platform-api in production would also require `sslmode=verify-full`, which would need a Postgres server certificate and CA mounted into the containers. |
| `REDIS_URL` must be `rediss://` | The kit uses `redis://:password@redis:6379` on the internal network with a required password. The compliant alternative is Redis with `--tls-port`, certificates, and `rediss://...?ssl_cert_reqs=required` for platform-api. Not built here: least-bad option is internal plaintext plus password. |
| `INTERNAL_SERVICE_TOKEN` at least 32 chars | Generated 64 hex chars. |
| `JWT_ACCESS_SECRET` at least 48 chars | Generated 96 hex chars. |
| `TRUST_PROXY` | `1` (Caddy is one hop). |
| `USSD_DEMO_ENABLED`, `USSD_ENABLED` | `false`; `deploy.sh` refuses to continue if `true`. |
| `PUSH_PROVIDER=firebase` | Set; needs the service account to deliver. |
| `OTP_PROVIDER=production` | Set. |
| `WEB_APP_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS` HTTPS, not localhost | Built from `DOMAIN`. |
| `OBJECT_STORAGE_PROVIDER=alibaba` + OSS_* | **Cannot be met on a free VM.** This is why the backend runs with `NODE_ENV=development`. |
| SMTP, commercial Open-Meteo, Gemini, non-fake speech/assistant | Required to pass the production schema; you supply them. |

To move to production mode later: set `API_NODE_ENV=production`, provide Alibaba OSS, add Postgres and Redis
TLS, and provide every key in the last row. Or change the code to allow a self-hosted S3 store. The
API will print the first failing guard on start, and `docker compose logs api` shows it.

## 17. Arm64 audit (evidence gathered from registries and package indexes)

Registry checks were `docker buildx imagetools inspect <image>`; wheel checks were the PyPI JSON file lists
(read-only). No image was built or run, so "runs correctly on arm64" is **UNVERIFIED** for everything.

| Component | arm64 available? | Evidence | Fix / note |
|---|---|---|---|
| `postgis/postgis:17-3.5-alpine` (repo default) | **NO** | manifest lists linux/amd64 only (also `17-3.5`, `17-master`, `18-3.6`; `17-3.6` does not exist) | Use `imresamu/postgis:17-3.5.3-alpine3.22` (amd64 + arm64, pinned by digest in the compose file). Alternative: `ghcr.io/baosystems/postgis:17-3.5` (amd64 + arm64). Both third-party; review before use. Move data between architectures with `pg_dump`/`pg_restore`, not by copying the data directory. |
| `redis:7.4-alpine` | yes | manifest includes linux/arm64/v8 | pinned digest in compose |
| `caddy:2-alpine` | yes | manifest includes linux/arm64/v8 | pinned digest in compose |
| `node:22-alpine` (api, worker, media-init) | yes | manifest includes linux/arm64/v8 | |
| `node:22-bookworm-slim` (web) | yes | manifest includes linux/arm64/v8 | |
| `python:3.12-slim` (platform, geospatial) | yes | manifest includes linux/arm64/v8 | |
| `rasterio==1.4.3` (platform-api, geospatial-ai) | **NO linux wheel** | PyPI file list for 1.4.3 has linux x86_64 only; `pip` would compile against missing GDAL and fail | Kit builds `rasterio==1.4.4`, which has `manylinux_2_28_aarch64` (verified on PyPI). Runtime compatibility with numpy 2.2 and the repo's code is UNVERIFIED; run the platform tests on arm64 before trusting results |
| `numpy` 2.2.6 / 2.2.5 | yes | manylinux_2_17_aarch64 cp312 wheels | |
| `shapely` 2.1.1 / 2.1.0 | yes | manylinux_2_17_aarch64 cp312 | |
| `onnxruntime` 1.22.1 | yes | manylinux_2_27/2_28_aarch64 cp312 | |
| `pillow` 12.3.0 | yes | manylinux_2_27/2_28_aarch64 cp312 | |
| `pandas` 2.2.3, `matplotlib` 3.10.3 | yes | aarch64 cp312 wheels | |
| `psycopg2-binary` 2.9.10 | yes | aarch64 cp312 wheels | |
| uvicorn standard extras (`uvloop`, `httptools`, `watchfiles`, `websockets`, `PyYAML`) | yes (nearby versions checked: uvloop 0.21.0, httptools 0.6.4, watchfiles 1.0.5, websockets 15.0.1, PyYAML 6.0.2) | aarch64 cp312 wheels | exact resolved versions are only known at build time: UNVERIFIED |
| `pydantic-core` | yes (2.33.2 checked) | aarch64 wheel | |
| GDAL | bundled inside the rasterio wheel | no system GDAL needed | |
| `celery`, `redis`, `SQLAlchemy`, `pyfao56`, `structlog`, `PyJWT`, `httpx`, `fastapi`, `beautifulsoup4` | pure Python | n/a | |
| `sharp` (api 0.35.x via lock; web 0.35.5) | yes (lock lists `@img/sharp-linuxmusl-arm64` and `@img/sharp-linux-arm64` with libvips) | `package-lock.json` entries | npm picks the right optional package at install; UNVERIFIED until built |
| `argon2` 0.44.0 | yes | local package contains `prebuilds/linux-arm64` with both glibc and musl `.node` files | |
| Next.js SWC, Tailwind oxide, lightningcss | yes | lock lists `@next/swc-linux-arm64-gnu`, `@tailwindcss/oxide-linux-arm64-gnu`, `lightningcss-linux-arm64-gnu` | web builds on bookworm (glibc): gnu variants apply |
| `ali-oss`, `bullmq`, `ioredis`, `pg`, TypeORM | pure JavaScript | n/a | |

## 18. Backups, updates, rollback

**Backups.** `scripts/backup.sh` writes a dated PostgreSQL dump (`pg_dump -Fc`, verified with
`pg_restore --list`) and a tarball of the media volume into `/var/backups/fasalguard`, and deletes files
older than 7 days. Add it to cron as the `deploy` user (`crontab -e`):

```
30 2 * * * /home/deploy/fasalguard-ai/deploy/oracle-free/scripts/backup.sh >>/home/deploy/backup.log 2>&1
```

Copy backups off the VM regularly: for example Oracle Object Storage (20 GB free; the Always Free tier
includes it) with `rclone`, or download with `scp` from your PC weekly. **Test a restore** at least once:
restore instructions are at the top of `scripts/backup.sh`.

**Updates.**

```bash
cd ~/fasalguard-ai && git pull          # or copy the new code again
cd deploy/oracle-free
# set a new IMAGE_TAG in .env (for example the date) so the old images remain for rollback
scripts/deploy.sh
```

`deploy.sh` takes a database backup before migrating. Run it in a quiet hour: there is a short interruption
while containers restart. OS security patches install automatically (`unattended-upgrades`); reboot when
`/var/run/reboot-required` exists (`sudo reboot`; containers restart by themselves).

**Rollback.**

1. Application only (no schema change): set `IMAGE_TAG` back to the previous tag in `.env`, then
   `docker compose up -d` (old images are still on the VM; `docker images | grep fasalguard-oracle`).
2. With a schema change: stop writes (`docker compose stop web api worker platform-api platform-worker
   platform-beat`), restore the pre-migration dump (commands in `scripts/backup.sh`), set the old
   `IMAGE_TAG`, `docker compose up -d`. Do not run `migration:revert`; it can destroy data.
3. A broken certificate or Caddy change: `docker compose logs caddy`; Caddy keeps the old certificate in the
   `caddy_data` volume. Never delete that volume casually: repeated requests hit Let's Encrypt rate limits.
4. Worst case (VM lost): create a new instance, repeat sections 4 to 10, restore the latest off-box dump and
   media tarball, move the reserved IP to the new VM.

## 19. Day-to-day commands

```bash
cd ~/fasalguard-ai/deploy/oracle-free
docker compose ps                          # status
docker compose logs -f --tail=100 api      # live logs (also: web worker platform-api caddy)
docker compose restart api                 # restart one service
docker stats --no-stream                   # memory and CPU
docker system df                           # disk used by images; prune old ones: docker image prune -a (after a good deploy)
```

If a hardened service crash-loops (`read_only` on the worker or beat was copied from
`deploy/compose.production.yml` but its runtime has never been verified): remove the `read_only: true`
line for that service in `docker-compose.yml`, `docker compose up -d`, and tell the developers.

## 20. Monitoring

- Free external uptime check: create an account at UptimeRobot (or similar), add an HTTPS monitor for
  `https://<domain>/api/v1/ready` (expects 200, and checks database, PostGIS, Redis and storage), 5-minute
  interval, e-mail alerts. Add a second monitor for `https://<domain>/api/health`.
- Watch disk: `df -h /` monthly. Images and logs grow; `docker image prune` after deploys.
- Certificates renew automatically about 30 days before expiry; the smoke test warns if under 7 days remain.
- Optional: set `SENTRY_DSN` (free tier) for error reports.
- The metrics endpoint is protected by `METRICS_TOKEN`; no Prometheus is included.

## 21. Troubleshooting quick table

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: connection timed out | Oracle security list or VM firewall closed | Section 5; `sudo ufw status`; `sudo iptables -L INPUT -n --line-numbers` |
| Browser: certificate error | DNS not yet pointing at the VM, or Let's Encrypt failed | `docker compose logs caddy`, fix DNS, `docker compose restart caddy` |
| 502 Bad Gateway | api or web not healthy yet | `docker compose ps`; `docker compose logs api` |
| `api` unhealthy, "SERVICE_NOT_READY" | database, Redis or storage dependency down | `docker compose exec api node -e "fetch('http://127.0.0.1:4000/api/v1/ready').then(r=>r.text()).then(console.log)"` shows which dependency is down |
| Uploads blocked in the browser console (CSP) | web image built with a different domain | Fix `DOMAIN` in `.env`, `docker compose build web && docker compose up -d web` |
| Build killed, exit 137 | out of memory | Check swap (`swapon --show`); build one service: `docker compose build web` |
| `pip` error building rasterio | someone replaced the kit Dockerfile with the repo one | Use `deploy/oracle-free/docker/*.Dockerfile` |
| Login returns 429 | per-IP rate limit (5 per minute) | Wait a minute |

## 22. Files in the kit

| File | Purpose |
|---|---|
| `deploy/oracle-free/docker-compose.yml` | The whole stack, internal network, memory limits, health checks, `migrate` profile |
| `deploy/oracle-free/Caddyfile` | HTTPS, routing, header defaults |
| `deploy/oracle-free/.env.template` | Every variable name with comments and no secrets |
| `deploy/oracle-free/docker/*.Dockerfile` | arm64 and CSP build adjustments |
| `deploy/oracle-free/scripts/gen-secrets.sh` | Creates `.env` and secrets |
| `deploy/oracle-free/scripts/bootstrap-vm.sh` | Fresh Ubuntu 24.04 VM setup |
| `deploy/oracle-free/scripts/deploy.sh` | Build, migrate, start, wait for health |
| `deploy/oracle-free/scripts/backup.sh` | Dump, media tarball, pruning, restore notes |
| `deploy/oracle-free/scripts/smoke-test.sh` | Post-deploy checks |
| `deploy/oracle-free/github-actions-build-arm64.yml.example` | Optional CI build |

## 23. Not verified (do not treat as working until you have seen it)

- Nothing was built or started: every image build, container start, health check, migration run, and the
  smoke test script are untested. The compose file passes `docker compose config -q` and the Caddyfile passes
  `caddy validate`; scripts pass `bash -n`.
- arm64 runtime behaviour of every native module (rasterio 1.4.4 with the repo code, onnxruntime, sharp,
  argon2, PostGIS on the `imresamu` image).
- `read_only` root filesystems for `worker` and `platform-beat` (copied from `deploy/compose.production.yml`,
  whose runtime hardening is listed as unverified in `docs/qa/DEPLOYMENT_CHECKLIST.md`). `cap_drop: ALL` was
  applied only where that file already does (web, platform services, worker) plus geospatial-ai and caddy
  (with `NET_BIND_SERVICE`); the core API only has `no-new-privileges`.
- Production-mode handling of the web app on HTTPS (QA ran it in development mode); first run may expose
  cookie or origin issues. The web runs with `NODE_ENV=production` and `WEB_APP_URL=https://<domain>`.
- That the API with `NODE_ENV=development` honours `TRUST_PROXY=1` and the rate limits behind Caddy, and that
  `/api/v1/ready` reports object storage as up for `local-disk` (code review says yes).
- Oracle console wording and the idle-reclamation criteria change over time; confirm them on Oracle's pages.
- Let's Encrypt issuance, the Oracle VCN rules, and the `iptables` changes in `bootstrap-vm.sh` on a real
  Oracle Ubuntu image.
- Platform satellite cutover (`SATELLITE_PLATFORM_ENABLED=true`), live Gemini, SMTP, Firebase and speech
  providers, and real vision weights.
