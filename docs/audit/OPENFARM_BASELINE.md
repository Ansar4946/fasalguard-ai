> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# OpenFarm Baseline Verification — Phase B

| | |
|---|---|
| Date | 2026-10-13 |
| Code | `superzero11/OpenFarm` @ `884a61567dd0d149214090baf9edebc533a2a0df`, run from a `git archive` export at `D:\banokabal\phaseb\openfarm` (the clone in `D:\banokabal\OpenFarm` is unmodified) |
| Compose project | `fasalguard-phaseb` (isolation verified, see `DOCKER_RESOURCE_REPORT.md`) |
| Command log | `logs/phaseb_run.log`: every command with its exit code |
| Test harness | `D:\banokabal\phaseb\harness\` (`api_baseline.py`, `pipeline_e2e.py`, `followup.py`, `satellite_validate.py`, `satellite_cloud_case.py`, `detection_test.py`, `pywapor_fixture.py`, `screens.py`) |
| Companion reports | `SATELLITE_NUMERICAL_VALIDATION.md`, `AUTH_IDENTITY_GAP.md`, `DOCKER_RESOURCE_REPORT.md`, `LEGACY_FASALGUARD_INVENTORY.md`, `PHASE_B_BLOCKERS.md` |

Result classes: `RUN_PASS`, `RUN_FAIL`, `STATIC_VERIFIED`, `BLOCKED_CREDENTIALS`, `BLOCKED_RESOURCES`, `BLOCKED_EXTERNAL_CREDENTIALS`, `NOT_TESTED`.

## 0. Deviations from "run the stack as shipped"

Each one is **contained to the Phase B run directory**, documented, and **not** a production change. Without them, nothing beyond the API process would have run.

| # | Deviation | Why | File |
|---|---|---|---|
| D1 | Port bindings on `127.0.0.1` instead of the dev file's `0.0.0.0` | Don't expose dev DB/Redis on the LAN | `docker-compose.phaseb.yml` |
| D2 | `.env` from `.env.example` with fresh random secrets; Google values left as placeholders; `RESEND_API_KEY` empty | No credentials supplied; no default secrets | `.env` (local only, never commit) |
| D3 | `DATABASE_URL_SYNC` forced to `postgresql+psycopg2://` for api, processor and ml-processor | Unpinned deps resolve SQLAlchemy 2.1.4, whose default `postgresql://` driver is psycopg v3, which is not installed (see B1) | `docker-compose.phaseb-driverfix.yml` |
| D4 | MinIO image replaced by `cgr.dev/chainguard/minio@sha256:dc455cdd…1e56` | `minio/minio` and `minio/mc` are no longer pullable (see B2) | `docker-compose.phaseb-s3sub.yml` |
| D5 | Test identities created with the SQL of `apps/web/src/lib/db.ts::upsertUser`; API tokens minted with this environment's `OPENFARM_JWT_SECRET` as `api/auth/token/route.ts` does | Google OAuth credentials unavailable; the API's own design trusts this secret. Web login **not** bypassed: no NextAuth cookies forged | harness |
| D6 | FTW checkpoint downloaded from the official release (sha256 `f87c041c…bcf97`, verified against GitHub's digest) and placed at the documented MinIO path | This undocumented provisioning step is required for detection | `D:\banokabal\phaseb\models` |
| D7 | Stuck jobs re-dispatched once via `celery call` | To get past the dispatch-before-commit race (B5) for a contained run | `logs/phaseb_run.log` |

## 1. Services

| Service | Image | Started | Health | Class | Notes |
|---|---|---|---|---|---|
| db | imresamu/postgis:16-3.4 (PostgreSQL 16.4, PostGIS 3.4.3) | yes | healthy | RUN_PASS | |
| redis | redis:7-alpine | yes | healthy | RUN_PASS | AOF + RDB per compose |
| minio | **substitute** (D4) | yes | healthy | RUN_PASS (substitute) / **RUN_FAIL (as shipped)** | `minio/minio:latest`: "pull access denied … repository does not exist" |
| minio-init | substitute (D4) | ran, exit 0 | — | RUN_PASS | bucket created; `basemap/` and **`photos/` set to anonymous download** |
| api | built | yes | healthy | **RUN_FAIL as shipped**, RUN_PASS with D3 | As shipped: all 10 `alembic upgrade` attempts failed (`No module named 'psycopg'`), then **uvicorn started anyway and `/healthz` reported healthy on an empty schema** |
| processor (Celery) | built (same as api) | yes | healthy | **RUN_FAIL as shipped**, RUN_PASS with D3 | As shipped: every task raised `ModuleNotFoundError: psycopg`; 4 backfill jobs stuck `pending` |
| tiler (TiTiler) | built | yes | healthy | RUN_PASS | auth-gated, but see security B7/B8 |
| web (Next.js 14.2.35) | built | yes | healthy | RUN_PASS | `npm install` without lockfile (see B3) |
| ml-processor | built (4.29 GB) | yes | healthy | RUN_PASS (start) / **RUN_FAIL (detection)** | see §6 |
| **celery beat** | — | **not defined anywhere** | — | **STATIC_VERIFIED missing**; one-off start RUN_PASS | see §7 |

## 2. Database migrations

| Test | Command | Exit | Result | Class |
|---|---|---|---|---|
| Upgrade as shipped (API container CMD) | `alembic upgrade head` (×10 retries) | fail ×10 | `ModuleNotFoundError: No module named 'psycopg'` (SQLAlchemy 2.1.4 default driver). DB left with only `spatial_ref_sys`. | **RUN_FAIL** |
| Upgrade with D3 | `docker compose run --rm --no-deps -e DATABASE_URL_SYNC=postgresql+psycopg2://… api alembic upgrade head` | 0 | 0001 → 0014 applied; 19 application tables | RUN_PASS |
| Downgrade to base | `… alembic downgrade base` | 0 | 14 steps | RUN_PASS |
| Re-upgrade | `… alembic upgrade head` | 0 | 14 steps, head `0014` | RUN_PASS |
| Survives Docker VM restart | — | — | head still `0014`, data intact | RUN_PASS |

Logs: `logs/alembic_upgrade.log`, `logs/alembic_downgrade_base.log`, `logs/alembic_upgrade_head.log`, `logs/api_startup.log`.

## 3. API tests actually executed

`logs/api_baseline_run2.jsonl`: **37 pass, 1 fail.** Run 1 (`run1.jsonl`) had 2 extra failures caused by **my** harness omitting the required `start_date`/`end_date`; fixed in run 2 and not counted as OpenFarm defects.

| Area | Checks (all RUN unless noted) | Result |
|---|---|---|
| AuthN | no token → 401; wrong-key signature → 401; expired → 401; `alg=none` → 401; valid → 200 `/users/me`; valid signature + unknown user → 404 | 6 / 6 PASS |
| Tenancy | missing `X-Org-Id` → 400; malformed → 400; foreign org → 403; cross-org field GET/PUT/DELETE → 404; field on foreign farm → 404; foreign field weather → 404 | 8 / 8 PASS |
| RBAC | viewer create farm → 403; viewer update field → 403; viewer read → 200 | 3 / 3 PASS |
| Farms/fields (F05) | create farm 201; create polygon 201; area 6.0359 ha equals PostGIS geodesic 6.0359 ha; stored `MULTIPOLYGON`, SRID 4326, `ST_IsValid` true; self-intersecting → 400; Point → 400; list farm fields 200 | 7 / 7 PASS |
| Validation | polygon at **longitude 200°** → **201 Created**, area 526,677 ha | **FAIL** |
| Weather (F04) | `GET /fields/{id}/weather` 200 in 1.07 s, 6 forecast days; **Tmax identical to a direct Open-Meteo call (max diff 0.0 °C over 6 dates)**; dates strictly future; summary 200 | 5 / 5 PASS (see findings W1–W3) |
| Share links | create 201 (43-char token); public read 200; unknown 404 | 4 / 4 PASS |
| Alerts, layers, audit | list endpoints 200 | 3 / 3 PASS |

Pipeline and end-to-end (`logs/pipeline_e2e.jsonl`, `logs/pipeline_followup.jsonl`):

| Check | Result | Class |
|---|---|---|
| NDVI job via API → Celery → STAC → COG → stats | completed in 35.3 s; 6 layers; stored NDVI 2026-10-06 = 0.6325 (equals independent validation) | RUN_PASS |
| EVI job | completed in 72.4 s, but values are **numerically wrong** (see satellite report) | RUN_PASS (pipeline) / RUN_FAIL (science) |
| Layer provenance | `provenance_json` = scene id, band hrefs, processed_at; `cloud_cover` stored | RUN_PASS |
| TiTiler without token | 401 | RUN_PASS |
| TiTiler owner tile | 200, PNG | RUN_PASS |
| **TiTiler cross-tenant** | bob (org B) got alice's tile **and her exact COG statistics** (mean 0.6325, 572 px) | **RUN_FAIL** |
| **TiTiler internal URL** | `url=http://api:8000/healthz` was fetched by GDAL ("not recognized as being in a supported file format") | **RUN_FAIL** (SSRF) |
| Share tile proxy | 200 `image/png`, no auth (by design) | RUN_PASS |
| Weather backfill task | 202, then 90 rows written, `source=open-meteo`, `model_used=best_match` | RUN_PASS |
| Soil refresh | 202; profile stored after ≈ 2.5 min (`source=soilgrids`, 250 m, 6 layers 0–200 cm). The harness's 75 s wait returned 404, but DB verification passed. | RUN_PASS (timing note) |
| Presign upload | 200 | RUN_PASS |
| **Upload type enforcement** | presign requested as `image/jpeg` with filename `leaf.html`; PUT `text/html` containing a `<script>` was accepted | **RUN_FAIL** |
| **Photo privacy** | anonymous GET of that object → **200 `text/html`**, script intact | **RUN_FAIL** |

## 4. Farm registration and field boundaries

- Farm and manual polygon field CRUD with PostGIS: **RUN_PASS** (§3).
- Missing coordinate-range validation: **RUN_FAIL**.
- The invalid field received no weather data: the daily fan-out silently produced 0 rows for it.
- Automatic boundary detection: **RUN_FAIL** (§6).

## 5. Weather

| # | Finding | Class |
|---|---|---|
| W0 | Real Open-Meteo data, verified against a direct provider call | RUN_PASS |
| W1 | "Today" is excluded (`d <= today` skipped) and computed in **UTC**. A 7-day request returns 6 days; Pakistan (UTC+5) loses the current day. | RUN_FAIL (minor) |
| W2 | With **no** weather rows, the summary reports `frost_days: 0, heat_stress_days: 0`, i.e. zeros instead of null/unknown | RUN_FAIL (data honesty) |
| W3 | Provider failure returns `[]` silently (`routers/weather.py:76-78`) | STATIC_VERIFIED |
| W4 | No weather-based alert rules exist (frost/heat/rain) | STATIC_VERIFIED |
| W5 | Open-Meteo free tier is non-commercial; a key is needed for production | STATIC_VERIFIED |

## 6. Satellite and ML

Summary (full detail in `SATELLITE_NUMERICAL_VALIDATION.md`):
- NDVI and NDWI as deployed are **correct** (Element84's `sentinel-2-l2a` is already offset-corrected).
- **EVI and SAVI are wrong** (+0.48 and +0.52 mean error).
- No per-pixel cloud or nodata masking. **False 106% and 73% NDVI-drop alerts were reproduced on real cloud-covered scenes.**
- Nodata pixels count as EVI/SAVI = 0.
- Harvest-season drops trigger alerts.
- `quality_score` is constant.

Boundary detection (FTW, `logs/detection_*.jsonl`):

| Step | Result | Class |
|---|---|---|
| Without checkpoint | job `failed`: `NoSuchKey … models/ftw/prue_efnetb5_ccby_checkpoint.ckpt`; 0 boundaries (fails honestly; imagery downloaded before the model check) | RUN_PASS (failure handling) |
| Dispatch | job inserted 05:44:06.078, task received 05:44:06.091 → `job_not_found` → **stuck `pending`** | RUN_FAIL (B5) |
| With checkpoint (re-dispatched) | STAC search, band download and input stacking OK; **model load failed**: checkpoint references `ftw_tools.training.trainers.CustomSemanticSegmentationTask`, installed `ftw-tools 1.4.3` provides `ftw.trainers`, and Lightning 2.6.6 blocks the unresolved class | **RUN_FAIL** |
| Peak memory | 1.07 GiB (before inference) | — |

## 7. Background jobs and scheduling

| # | Check | Result | Class |
|---|---|---|---|
| J1 | Worker connects to Redis broker and result backend | `redis://redis:6379/0` | RUN_PASS |
| J2 | Registered tasks (processor) | 11 tasks incl. `schedule_weekly_index_compute`, `schedule_daily_weather_fetch` | RUN_PASS |
| J3 | Beat schedule in code | `compute-indices-weekly` crontab `0 6 * * 1`; `fetch-weather-daily` `0 8 * * *`; **timezone UTC** (11:00 / 13:00 PKT) | RUN_PASS (`logs/celery_schedule_inspect.txt`) |
| J4 | Beat in deployment | `grep -ci beat` = 0 in `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.dev.yml`, `deploy/terraform/templates/cloud-init.yaml.tftpl`, `deploy/setup.sh` | **STATIC_VERIFIED: missing**. Scheduled jobs never run in any shipped configuration. |
| J5 | Beat can run | one-off `celery beat` started and loaded the schedule (`logs/celery_beat_oneoff.log`) | RUN_PASS (contained) |
| J6 | Daily weather task when invoked | fanned out per field; rows upserted (`open-meteo`) | RUN_PASS |
| J7 | Weekly index task when invoked | "fields_dispatched=4, jobs_dispatched=16", **all 16 failed `job_not_found`**; rows stuck `pending` with no error | **RUN_FAIL** |
| J8 | Root cause of J7 and §6 | `send_task`/`.delay` before commit: `tasks/backfill.py:274-287` (commit after loop), `routers/jobs.py:64-73`, `routers/soil.py:119-124`, `routers/detection.py` (flush → send_task; commit in `get_db` after response). `routers/fields.py` commits first (correct). | STATIC_VERIFIED + RUN reproduced |
| J9 | Stuck-job recovery | none: a task that finds no job returns `{"status":"error"}` without marking anything; no sweeper | STATIC_VERIFIED |

## 8. Map layers and data provenance

| Item | Evidence | Class |
|---|---|---|
| COG written per field/date/index at `s3://openfarm/cogs/<org>/<field>/<date>/<index>.tif` | `raster_layers.cog_uri` | RUN_PASS |
| Tile URL template (`/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=/vsis3/…`) renders PNG | tiler 200 | RUN_PASS |
| Provenance: scene id, band hrefs, processed_at, cloud cover | `provenance_json` | RUN_PASS |
| Provenance missing: processing baseline, offset flag, clear-pixel fraction, code version | — | STATIC_VERIFIED gap |
| Weather provenance: `source`, `model_used`, lat/lon | `weather_daily` | RUN_PASS |
| Soil provenance: `source`, `source_resolution_m`, centroid | `soil_profiles` | RUN_PASS |
| Map rendering in a browser with real tiles | needs an authenticated session | BLOCKED_CREDENTIALS |

## 9. Web application

| Check | Result | Class |
|---|---|---|
| Landing page 200 (303 KB); robots, sitemap, `/api/health` 200 | `logs/web_checks.log` | RUN_PASS |
| Protected routes redirect to `/?signin=true` | 4 / 4 | RUN_PASS |
| Providers = Google only; PKCE S256 request built | placeholder client id | RUN_PASS |
| Google browser login, authenticated UI, map layers in UI | — | **BLOCKED_CREDENTIALS** |
| `next lint` | passes, 2 `react-hooks/exhaustive-deps` warnings | RUN_PASS |
| `tsc --noEmit` | passes | RUN_PASS |
| Screenshots (public only), no console errors | `screenshots/openfarm_landing_desktop.png`, `openfarm_landing_mobile.png`, `openfarm_signin_modal.png`, `openfarm_dashboard_unauth_redirect.png` | RUN_PASS |
| Landing hero shows a sample alert card ("BLOCK A1 · 12.40 HA · RICE … NDVI fell 18%") without an "illustrative" label | screenshot | finding (presentation) |

## 10. Static analysis and dependency audit

| Check | Result | Class |
|---|---|---|
| `scripts/check-env-parity.py` (Phase A) | pass | RUN_PASS |
| `ruff format --check .` | 62 files formatted | RUN_PASS |
| `ruff check .` (ruff latest; CI installs `ruff>=0.3.0` unpinned) | **213 errors** (BLE001 ×25, B008 ×16, UP007 ×9, …). OpenFarm's own CI would fail on a fresh run. | **RUN_FAIL** |
| `pip-audit` (API image) | 15 advisories: `python-jose 3.5.0` CVE-2026-85394, `ecdsa 0.19.2`, image `pip 25.0.1` | RUN_FAIL |
| `npm audit --omit=dev` (lockfile, Phase A) | 20 (3 critical) | RUN_FAIL |
| Web image dependency resolution | lockfile ignored; e.g. `nanoid@6.0.2` requires Node ≥ 22 on a Node 20 image | RUN_FAIL (reproducibility) |
| Automated test suite | none exists (CI step is `echo "No tests yet"`) | STATIC_VERIFIED |

## 11. Mock or unreliable behaviour found in OpenFarm

No fabricated data paths (no `random`/mock fallbacks) were found in OpenFarm's runtime code. The unreliable behaviours are:
1. **Silent failure states:** health "healthy" on an unmigrated DB; jobs stuck `pending` forever; weather `[]` on provider error.
2. **Zero-as-fact:** `frost_days 0` / `heat_stress_days 0` with no data.
3. **Wrong science:** EVI and SAVI values; nodata counted as 0.
4. **Cloud-contaminated alerts.**
5. **Constant `quality_score`.**
6. **The unlabelled sample card on the marketing page.**

## 12. Not tested (and why)

| Item | Class | Reason |
|---|---|---|
| Google login, authenticated UI flows, browser map | BLOCKED_CREDENTIALS | no OAuth client |
| Resend email (invites) | BLOCKED_CREDENTIALS | no key; empty key set |
| FTW inference accuracy on Pakistani fields | RUN_FAIL upstream | model never loaded |
| pyWaPOR external integration tests (139) | BLOCKED_EXTERNAL_CREDENTIALS | not requested, per instruction; **offline fixtures 5 / 5 RUN_PASS** vs FAO-56 incl. Example 18 ET₀ 3.880 vs 3.9 mm/d (`logs/pywapor_fixture.log`) |
| Rate-limit thresholds, load | NOT_TESTED | out of Phase B scope |
| Backup/restore (`deploy/backup.sh`) | NOT_TESTED | Phase C/E |
| Production compose / Caddy / Terraform | NOT_TESTED | needs a domain and a cloud account |
