> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Fasal Guard — Phase A Source Repository Audit

| | |
|---|---|
| Audit date | 2026-10-13 |
| Scope | Phase A only (source audit). No source code has been imported. Phase B (OpenFarm runtime baseline) has **not** been run yet. |
| Clone location | `D:\banokabal\<repo>` — all nine clones verified unmodified (`git status --porcelain` empty) after the audit. Tests were run on `git archive` exports in a scratch directory, never in the clones. |
| Evidence | `docs/audit/logs/` (test output, npm audit, commit SHAs) |
| Companion docs | [LICENSE_MATRIX.md](LICENSE_MATRIX.md) · [DEPENDENCIES.md](DEPENDENCIES.md) · [REAL_VS_MOCK.md](REAL_VS_MOCK.md) |

## How to read the status labels

| Label | Meaning in this audit |
|---|---|
| IMPLEMENTED_AND_TESTED | Real code path, and a test or reproducible run **executed by us** exercised it and passed. |
| IMPLEMENTED_UNTESTED | Real code path (calls real providers / does real computation), but no test exists or we could not execute one. |
| PARTIAL | Real code exists but omits something the feature needs, or is scientifically/functionally incomplete. |
| MOCK_ONLY | Output is fabricated (random, hardcoded, or placeholder) on the main path or a silent fallback path. |
| ROADMAP_ONLY | Described in README/UI/comments; no working code. |
| BROKEN | Code exists but fails when run, or a static trace shows it cannot work. |
| NOT_FOUND | Nothing in the repository. |

**Evidence method** is stated on every finding: **RUN** = executed by us, output in `docs/audit/logs/`; **STATIC** = established by reading the code (file:line cited). A STATIC finding is never reported as "tested".

## Commit SHAs (exact versions audited)

| Repo | Commit SHA | Commit date | Commits |
|---|---|---|---|
| superzero11/OpenFarm (base) | `884a61567dd0d149214090baf9edebc533a2a0df` | 2026-08-14 | 117 |
| Mertcan-Gelbal/botanix-mobile-ai | `379fd137a119a54ae3efba1f5d849dbb5a8d58fd` | 2026-07-18 | 11 |
| kthorp/pyfao56 | `1d242ee985be0edbc4946f06e7e94a487d4bc0c9` | 2026-02-12 | 296 |
| un-fao/fao-wetl-pywapor | `388b536f59b56e3ba7ea000e28d1ffc621e8319d` | 2026-06-16 | 862 |
| debasisnishank/kissan-alert-solution | `6a5f143eab72eeac938f9d1dab9ce0cb084c530b` | 2026-07-08 | 61 |
| ghwmelite-dotcom/AgroTrust | `5239452f79d0759ec9014d4e88bd2821e34b2935` | 2026-08-02 | 45 |
| FARMIQ-T/Farmiq | `7680e4e982a07c0473c38e3c7fc57beeaf220ba6` | 2025-11-06 | 9 |
| faiqfahim/Kisan_Rabta | `30dadb4836a2636991e68b6c3399a5e669bbdbee` | 2026-04-11 | 1 |
| AmiNilay/Crop-Yield-Prediction-System | `989534169d196db6cabb7c13cc809d8bba48cd9e` | 2026-08-02 | 25 |

All clones were fetched on the audit date and are 0 commits behind `origin`.

---

## Executive summary

1. **OpenFarm is a sound base and should be kept** (BSD-3, FastAPI + Next.js + PostGIS + Redis/Celery + MinIO + TiTiler, consistent org-level tenancy). But it has **zero automated tests** (CI's test step is literally `echo "No tests yet"`), and it covers only F02, F04 and F05, each with significant defects.
2. **OpenFarm's satellite indices are scientifically incorrect for EVI and SAVI**, and there is **no per-pixel cloud mask**, so clouds produce false NDVI-drop alerts. **Corrected in Phase B:** NDVI and NDWI are *not* biased for the collection OpenFarm uses, because Element84 has already removed the BOA offset from `sentinel-2-l2a`. Both were verified exact on a real scene. The EVI/SAVI and cloud findings were confirmed on real data. See [SATELLITE_NUMERICAL_VALIDATION.md](SATELLITE_NUMERICAL_VALIDATION.md).
3. **OpenFarm's scheduled jobs never run.** `worker.py` defines a Celery beat schedule (weekly index compute, daily weather fetch), but no compose file starts `celery beat`.
4. **No reference repository contains real, reusable crop-disease inference (F01/F06).** Botanix's "on-device TFLite" diagnosis is fabricated: it picks a result from a hardcoded list using `Math.random()` and whether the image URI contains `"camera"`, and never reads pixels. Its LLM `.tflite` is 26 MB of zeros, and its classifier `.tflite` is not a valid flatbuffer. Its PyTorch weights *are* genuine (they match the upstream Hugging Face SHA-256).
5. **No reference repository implements Pakistani mandi prices (F07).** kissan-alert's price module fabricates prices (random variance, stamped with today's date) and price trends (a random walk) whenever its Indian data.gov.in key is absent or fails.
6. **Both credit scores are unusable.** AgroTrust's is gamification points (achievements and referrals add to the "credit score"). Farmiq's model is trained on 1,000 synthetic farmers from its own `np.random` generator.
7. **Feature-phone channels (F09/F11) have no working source.** Farmiq's USSD state machine cannot reach its second-level menus, and its auth check would reject real gateway callbacks. AgroTrust's mobile-money flow is a stub that tells farmers "you will receive a prompt" without calling any provider.
8. **There is a critical authentication bypass in AgroTrust.** OTP `123456` is accepted for any phone number in every environment. This does not affect us unless the code is copied, and it must not be.
9. **The genuinely reusable scientific components are pyfao56** (CC0; we reproduced all 11 regression scenarios) **and pywapor** (Apache-2.0; installs and imports, but its tests are blocked on CDS/Copernicus credentials).
10. **OpenFarm authentication is Google-OAuth only.** That structurally excludes feature-phone farmers and is the largest architectural gap for F09/F11/F12/F14. Phone-number identity must be added.

### Recommended decision per repository

| Repo | Decision | One-line rationale |
|---|---|---|
| OpenFarm | **REUSE as base** (fix defects listed below) | Real, well-structured geospatial stack; tenancy model is consistent; matches the target architecture. |
| pyfao56 | **REUSE (as a pinned dependency)** | CC0, regression outputs reproduced; FAO-56 dual-Kc water balance is exactly what F03 needs. |
| pywapor | **ADAPT (optional, later)** | Apache-2.0, authoritative FAO WaPOR algorithm for water productivity; heavy (GDAL, numpy<2, many provider accounts). |
| Crop-Yield-Prediction-System | **REFERENCE** | Honest pipeline on real public Indian data; India-only, weak validation, no license file. Methodology reference for F13. |
| kissan-alert-solution | **REFERENCE (selected logic); REJECT mock paths** | Deno/Fresh stack (not ours); FCM v1 sender and Gemini wrapper are real; prices/NDVI/TTS fallbacks fabricate data; no license file. |
| botanix-mobile-ai | **REFERENCE (UI only); REJECT inference** | Inference is fabricated; only the upstream PyTorch weights are real, and their license is unspecified. |
| AgroTrust | **REFERENCE (ledger/audit-event pattern only); REJECT auth, payments, scoring** | Cloudflare D1 stack; critical OTP bypass; payment stubs; gamified "credit score". |
| Farmiq | **REFERENCE (USSD menu copy only); REJECT** | Broken USSD state machine; synthetic-data credit model; committed `.venv` with 38 `.exe` files and pickles. |
| Kisan_Rabta | **REFERENCE (Urdu STT approach only); REJECT code** | Pakistan-relevant idea, but depends on a personal sleeping HF Space and an unofficial cookie-based HugChat client; committed `node_modules`; mobile app absent. |

---

## 1. OpenFarm (primary base)

- **URL:** https://github.com/superzero11/OpenFarm · **SHA:** `884a6156…a0df` · **License:** BSD-3-Clause
- **Shape:** 288 tracked files. `services/api` (FastAPI, 13 routers, 9 Celery task modules, 14 Alembic migrations), `apps/web` (Next.js 14 App Router, next-intl en/es), `services/tiler` (TiTiler), `deploy/` (Terraform for Oracle Cloud, Caddy, backup script).
- **Compose services:** `db` (imresamu/postgis:16-3.4), `redis`, `minio`, `minio-init`, `api`, `processor` (Celery default queue), `ml-processor` (Celery `ml` queue, PyTorch CPU + ftw-tools), `tiler`, `web`. **There is no `beat` service.**
- **Tests:** none. CI (`.github/workflows/ci.yml`) runs env-parity, `ruff`, web lint and `tsc`; the API test step is `echo "No tests yet" && exit 0`.
- **We ran:** `scripts/check-env-parity.py` → **PASS** ("34 documented keys, 5 public web vars"). We also ran `npm audit --omit=dev` on `apps/web/package-lock.json` → **20 vulnerabilities (3 critical, 9 high)**, all with fixes available ([log](../../../banokabal/docs/audit/logs/openfarm_web_npm_audit.txt)). Full runtime verification is Phase B.

### Capability records

| # | Capability | Location | Status | Evidence | Gaps | Decision |
|---|---|---|---|---|---|---|
| OF-1 | Org/tenant authorization | `services/api/app/middleware/auth.py` `get_org_context`, `require_roles` | IMPLEMENTED_UNTESTED | STATIC: every router resolves resources through `ctx.org_id` (weather.py:45-51, soil.py:43-49, scouting.py:97/125/165, jobs.py:41/147, alerts.py:70/166, monitoring.py:85/117, detection.py:79-84, share.py:92/117). Soft-deleted orgs are excluded via a join (auth.py:93-103). | No tests at all. Org selected by client header `X-Org-Id`. | **Reuse**; add an authorization test matrix before any feature work. |
| OF-2 | User authentication | `apps/web/src/lib/auth.ts` (NextAuth, Google provider only); `apps/web/src/app/api/auth/token/route.ts` mints an HS256 JWT | IMPLEMENTED_UNTESTED | STATIC. | **Google OAuth only**, so there is no phone/OTP identity for feature-phone farmers. Token route falls back to secret `"change-me"` if `OPENFARM_JWT_SECRET` is unset (route.ts:7-9). No `iss`/`aud` claims are validated. One shared HS256 secret across web, API and tiler. `python-jose` is unmaintained. | **Adapt**: add phone-number identity; fail closed on a missing secret; add `iss`/`aud`. |
| OF-3 | Farm and field CRUD with PostGIS geometry, area in ha (EPSG:6933), GeoJSON import | `routers/farms.py`, `routers/fields.py` | IMPLEMENTED_UNTESTED | STATIC: farm ownership checked before field create (fields.py:83-85). | Error messages echo raw exceptions (`f"Invalid geometry: {e}"`). | **Reuse** (F05). |
| OF-4 | Automatic field-boundary detection (FTW model) | `tasks/detection.py`, `routers/detection.py`, `Dockerfile.ml` | IMPLEMENTED_UNTESTED | STATIC: loads `prue_efnetb5_ccby_checkpoint.ckpt` from MinIO (detection.py:183-200). | **Undocumented manual step**: the 120 MB checkpoint must be uploaded to MinIO by hand. This is recorded only as a ticked task in `docs/TaskList.md:595`, not in README or DEPLOYMENT. The checkpoint is unpickled on load (trust boundary is MinIO). There's a version-compat monkey-patch for torchgeo. FTW accuracy on Pakistani smallholder fields is unverified. | **Reuse**, after documenting provisioning and pinning the checkpoint hash. |
| OF-5 | Sentinel-2 STAC search and per-field index COGs (NDVI, EVI, SAVI, NDWI), zonal stats, provenance | `tasks/pipeline.py`, `tasks/indices.py`, `tasks/vegetation.py`, `routers/monitoring.py` | **PARTIAL (scientific defects)** | *Phase B correction: the offset part of this record does not apply to `sentinel-2-l2a`, which is already offset-corrected. NDVI and NDWI were verified exact; EVI/SAVI wrong; no SCL mask. See SATELLITE_NUMERICAL_VALIDATION.md.* STATIC: `read_band_windowed` (pipeline.py:184-203) reads raw DN with no ×0.0001 scale and no −1000 BOA offset (processing baseline ≥ 04.00). `_evi` (indices.py:25-29) uses reflectance constants (`+1.0`, `6.0`, `7.5`) on DN, which makes the result wrong, and the error is then hidden by `clip(-1,1)`. On DN values `_savi` with L=0.5 becomes ≈1.5×NDVI. No SCL cloud/shadow mask (grep for `SCL` finds nothing); only scene-level `eo:cloud_cover < 20` (pipeline.py:119). Provenance JSON stores the scene id and cloud cover (pipeline.py:532). | Fix scaling and offset; add an SCL mask (classes 3, 8, 9, 10, 11); record processing baseline in provenance; add golden-value tests. To be confirmed numerically in Phase B on a real scene. | **Reuse, fix first** (F02). |
| OF-6 | Index-drop and threshold alerts | `pipeline.py:333 run_alerts`, `apps/web/src/lib/alert-rules.ts` | PARTIAL | STATIC: alert rules are only vegetation-index and soil rules. | Inherits OF-5's cloud false positives. **No weather alerts** (frost, heat, heavy rain, wind). Alerts go to in-app only; email exists only for invites. | **Adapt** (F04/F12). |
| OF-7 | Weather: Open-Meteo forecast (on request) and archive backfill to `weather_daily` | `routers/weather.py:56-103`, `tasks/weather.py` | PARTIAL | STATIC: 15 s timeout. Task retries with exponential backoff (weather.py:159, 312). | On provider failure the forecast returns `[]`, so the UI cannot tell "provider down" from "no data" (weather.py:76-78). Forecast dates are in UTC, not local. The daily fetch never runs (OF-8). Open-Meteo's free tier is non-commercial; commercial use needs a paid key, which the code supports via `open_meteo_api_key`. | **Reuse, fix** (F04). |
| OF-8 | Scheduled jobs (weekly index compute, daily weather) | `app/worker.py:42-51` | **BROKEN** | STATIC: `beat_schedule` is defined, but no compose file (dev or prod) runs `celery beat` (grep for `beat` in `docker-compose*.yml` finds nothing). | Add a beat service; prevent duplicate schedulers. | **Fix**. |
| OF-9 | "Water balance" (30-day ET₀ − P, drought index) | `tasks/weather.py:332 _update_water_balance`, `routers/weather.py:258-260` | PARTIAL | STATIC: `water_deficit = total_et0 - total_precip`. | Reference ET only: no crop coefficient, no soil water capacity, no root zone, no irrigation events. It is not an irrigation recommendation. | **Keep as context**; F03 needs pyfao56. |
| OF-10 | Soil profiles (SoilGrids WCS, POLARIS), crop suitability, nutrient/carbon heuristics | `tasks/soil.py` (1,330 lines), `core/soil_intelligence.py` (2,261 lines), `routers/soil.py` | IMPLEMENTED_UNTESTED | STATIC. | Largest untested module; the provenance of the heuristic thresholds needs review before agronomic use. | **Reuse with review**. |
| OF-11 | Scouting observations with photo upload (presigned PUT) | `routers/scouting.py`, `routers/uploads.py` | IMPLEMENTED_UNTESTED | STATIC. | **Privacy**: `minio-init` sets `photos/` to anonymous download (docker-compose.yml, `mc anonymous set download …/photos`), so farmer photos are public by URL. The object extension comes from the client filename unsanitized (uploads.py:52). The presigned PUT does not bind content type or size. **No AI diagnosis.** | **Adapt** (basis for F01 image intake). |
| OF-12 | Public share links with tile proxy | `routers/share.py` | IMPLEMENTED_UNTESTED | STATIC. | Review token entropy and expiry in Phase B. | **Reuse**. |
| OF-13 | Org audit events | `routers/orgs.py:703 list_audit_events` | IMPLEMENTED_UNTESTED | STATIC. | Scope is org/member changes only. | **Reuse and extend** (AuditEvent entity). |
| OF-14 | Rate limiting (slowapi) | `core/rate_limit.py`, 9 decorated endpoints | PARTIAL | STATIC. | Applied to only 9 endpoints. | **Reuse and extend**. |
| OF-15 | Health checks | `/healthz` (API, tiler), `/api/health` (web), compose healthchecks | IMPLEMENTED_UNTESTED | STATIC. | Liveness only; no readiness probe that checks the DB, Redis or MinIO. | **Extend**. |
| OF-16 | Deployment (Terraform for OCI, Caddy, backup.sh) | `deploy/` | IMPLEMENTED_UNTESTED | STATIC. | Restore procedure not verified. `minio/minio:latest` and `minio/mc:latest` are unpinned. | **Reference** for the production phase. |

**Absent from OpenFarm** (verified by search): crop disease AI (F01, F06), irrigation scheduling (F03), market prices (F07), voice/STT/TTS (F08), USSD/IVR/SMS (F09, F11), AI assistant (F10), push/SMS delivery tracking (F12), yield prediction (F13), any financial entities (F14), and mobile app (the web app is responsive only).

**Launch without undocumented steps?** Not fully. The FTW checkpoint upload (OF-4) is undocumented, and Google OAuth credentials are required just to log in. The env template ships weak dev secrets (`openfarm_dev`, `change-me-…`), which is acceptable for local development only. Verifying the launch itself is Phase B.

---

## 2. botanix-mobile-ai (F01/F06 candidate)

- **URL:** https://github.com/Mertcan-Gelbal/botanix-mobile-ai · **SHA:** `379fd137…8fd` · **License:** MIT (code). Bundled model: HF license `other`, terms unspecified.
- **Stack:** Expo SDK 53, React Native 0.79, expo-router. Declares `react-native-fast-tflite` and `onnxruntime-react-native`.
- **Tests:** none (the `jest` script exists, but there are no test files).

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| BX-1 | "On-device TFLite plant disease classification" | `services/PlantDiseaseService.ts:149-278` `classifyImage` → `simulateInference` → `getPredictionsBasedOnImage` | **MOCK_ONLY** | STATIC: the comment reads "Simulate model inference with realistic results" (line 164). The class is chosen from 5 hardcoded labels depending on whether the URI contains `camera`/`tmp`/`cache` (lines 224-245). Confidence = constant + `Math.random()` (240-253), adjusted by `Date.now() % 100` (258-268). Pixels are never read. `react-native-fast-tflite` and `onnxruntime-react-native` are **never imported** (grep across `*.ts`/`*.tsx`). | **Reject** |
| BX-2 | Bundled classifier `mobilenet_v2_plant_disease.tflite` | `assets/models/mobilenet/` | **BROKEN** | RUN: bytes 0-3 are `TFL3`. A valid TFLite flatbuffer has a root offset at bytes 0-3 and `TFL3` at bytes 4-7. Read as an offset, the first 4 bytes give 860,636,756, which is larger than the 3,148,788-byte file, so it isn't a valid flatbuffer. | **Reject** |
| BX-3 | Bundled `pytorch_model.bin` | same | Real artifact | RUN: SHA-256 `19fc22d6…c917` is byte-identical to `linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification` on HF (rev `c1861579`). 38 PlantVillage classes. | **Reference only.** License is `other` (unspecified). Card says 95.4% accuracy, the bundled `eval_results.json` says 78.6%. Trained on lab-style "New Plant Diseases Dataset" images. Not a basis for production F06 without our own training/evaluation and license clearance. |
| BX-4 | "PLLaMa" on-device LLM `pllama_mobile.tflite` | `assets/models/pllama/` | **MOCK_ONLY** | RUN: 26,214,400 bytes = `TFL3` + 26,214,396 zero bytes (entropy 0.0). | **Reject** |
| BX-5 | Plant chat assistant | `services/PLLaMaService.ts:94-144` | BROKEN / IMPLEMENTED_UNTESTED | STATIC: actually calls remote `microsoft/DialoGPT-medium` (a general chit-chat model, MIT) at `api-inference.huggingface.co`, which HF has retired in favour of Inference Providers. Requires gitignored `config/SecureConfig.ts` (undocumented step for a fresh clone). | **Reject** |
| BX-6 | Camera/gallery capture UI, result screens | `app/(tabs)/*.tsx` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** for mobile UX. |

**Security:** a Clerk publishable key (`pk_test_…`) appears in git history. That is low severity, since publishable keys are meant to be public. The repo carries thesis PDFs, DOCX and PPTX (50 MB).

---

## 3. pyfao56 (F03)

- **URL:** https://github.com/kthorp/pyfao56 · **SHA:** `1d242ee9…c0c9` · **Version:** 1.4.3 · **License:** CC0 1.0 / US-Government public domain
- **Stack:** pure Python (numpy, pandas, matplotlib, requests).
- **Capabilities:** FAO-56 dual crop coefficient daily soil water balance (`model.Model`), ASCE standardized reference ET (`refet`), stratified soil profiles (`soil_profile`), automatic irrigation scheduling (`autoirrigate.AutoIrrigate`, published method: Thorp et al. 2025, *Agric. Water Manag.* 322:110013), forecast-driven weather (`tools/forecast.py`), blue/green water accounting (`tools/blue_green.py`), statistics.

| # | Capability | Status | Evidence |
|---|---|---|---|
| PF-1 | FAO-56 dual-Kc daily water balance (`model.Model.run`) | **IMPLEMENTED_AND_TESTED** | RUN: all 11 scenario suites executed on Python 3.14.7 with numpy 2.5.4/pandas 3.0.6, and again with pandas 2.3.3/numpy 2.3.5. Outputs diffed against committed expected files, ignoring `Timestamp:` and `(ver. x)` header lines. **10 of 11 suites reproduce exactly.** |
| PF-2 | Auto-irrigation (`AutoIrrigate`) | **IMPLEMENTED_AND_TESTED** (scenario level) | RUN: `test09/cotton2018p06-1case00.{out,sum}` reproduce exactly. The generic `test09/cotton2018.{out,sum}` differ (e.g. Irrig 880.0 → 917.4 mm) under **both** pandas versions. Root cause: `run(case, plot)` is parameterised, and the committed generic file was last written by a different scenario. The only source change since the expected outputs (`git diff 5371257 HEAD -- src/`) is a docstring. Not a model regression. |
| PF-3 | ASCE refET (`refet`) | IMPLEMENTED_AND_TESTED | RUN: test02 A/B pass. test02 C is interactive (prompts `Continue (Y/N)?` on questionable weather data) and was answered `N`. |
| PF-4 | Forecast weather ingestion | IMPLEMENTED_UNTESTED for Pakistan | `tools/forecast.py` targets the US NWS/AZMet; tests 02/04 fetched live 2025/2026 AZMet data. Needs an Open-Meteo adapter for Pakistan. |

- **Test command:** `python -c "import <script>; <script>.run()"` per `tests/testNN/*.py`, then `git diff` against the committed outputs ([log](../../../banokabal/docs/audit/logs/pyfao56_regression.log)).
- **Gaps:** no assertion-based test suite; `geojson` is an undeclared test dependency (needed by test09/test11); `matplotlib` is a hard runtime dependency (heavy for an API worker); crop parameters (Kcb, root depth, p) for Pakistani wheat, cotton, rice and sugarcane must be sourced from FAO-56 tables or local calibration and documented.
- **Decision: REUSE** as a pinned PyPI dependency (`pyfao56==1.4.3`) inside a new `water-worker`. Wrap it with our own assertion tests built from these reproduced scenarios.

---

## 4. fao-wetl-pywapor (F03 water productivity)

- **URL:** https://github.com/un-fao/fao-wetl-pywapor · **SHA:** `388b536f…319d` · **Version:** 3.7.3 · **License:** Apache-2.0
- **Capabilities:** WaPOR ETLook (actual ET, T, E, biomass, water productivity), SERoot soil moisture, collection from ~20 providers (Sentinel-2/3, MODIS, VIIRS, ERA5, CHIRPS, Copernicus DEM, WaPOR statics), sharpening (pyDMS), gap filling.
- **Tests:** `tests/main_test.py` and `tests/collect_test.py` contain 139 parametrised tests, **all of which download real data**. `conftest.py` marks AppEEARS tests `serial`.

| # | Capability | Status | Evidence |
|---|---|---|---|
| PW-1 | Package install and import | IMPLEMENTED_AND_TESTED (install only) | RUN in `mambaorg/micromamba:1.5.10`: conda-forge Python 3.12 + GDAL 3.13.3 + numpy 1.26.4. `import pywapor` OK. |
| PW-2 | ETLook / SERoot / pre-processing pipeline | IMPLEMENTED_UNTESTED (**test suite BLOCKED on credentials**) | RUN: first attempt failed at collection on a numba ↔ coverage incompatibility (an environment issue, fixed by `coverage>=7.4`). Second attempt collected 139 tests. The first test `test_data_download[bb0]` stops at an interactive `CDS Personal Access Token:` prompt (needs CDS and COPERNICUS_DATA_SPACE accounts) ([log](../../../banokabal/docs/audit/logs/pywapor_tests.log)). |

- **Credentials required for a full run:** NASA Earthdata (MODIS/SRTM/VIIRS/MERRA2 via AppEEARS), Copernicus CDS (ERA5), Copernicus Data Space (Sentinel-2/3), VITO TERRA (PROBA-V), EUMETSAT LSASAF, WaPOR.
- **Gaps:** `numpy<2` and `pandas<3` pins conflict with a modern API image, so it needs an isolated worker image. GDAL is required (no pip wheel on Windows). There's no offline unit test of the ETLook equations. Runs are heavy (GBs per AOI per season).
- **Decision: ADAPT, later (P2+)**. Run in an isolated `water-worker` image for seasonal water-productivity products. Do not put it on the request path. Unblocking needs credentials from the project owner.

---

## 5. kissan-alert-solution ("Khetscope")

- **URL:** https://github.com/debasisnishank/kissan-alert-solution · **SHA:** `6a5f143e…530b`
- **License:** README says "MIT", but there is **no LICENSE file**.
- **Stack:** Deno 2 + Fresh 1.6 (Preact) + PostgreSQL/PostGIS + Postgres-backed job queue; Gemini (Vertex AI), Sarvam (Indian-language translation/TTS), FCM v1, Open-Meteo, NASA POWER, Element84 STAC, data.gov.in/Agmarknet. India-focused.
- **Tests:** `tests/farm_test.ts` and `tests/satellite_test.ts`, plus k6 load scripts.

**Test run:** `deno test -A tests/` (deno 2.1.4) → **13 passed, 0 failed** ([log](../../../banokabal/docs/audit/logs/kissan_alert_deno_test.log)). **However**, both test files import only `std/assert`. They test inline arithmetic, not the application modules, so **the passing tests give zero coverage of the implementation**.

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| KA-1 | Market prices | `lib/satellite/market.ts:59-260` | **MOCK_ONLY on fallback** | STATIC: with no `DATA_GOV_API_KEY`, or on fetch failure, it falls through to eNAM, whose `parseENAMResponse` **always returns `[]`** (192-199). It then calls `getCachedMarketPrices`, which fabricates prices for four hardcoded Indian mandis with `(Math.random()-0.5)*200` variance and `arrivalDate: new Date()` (215-259). | **Reject** |
| KA-2 | Price trend | `market.ts:262 getPriceTrend` | **MOCK_ONLY** | STATIC: `basePrice * seasonalFactor + (Math.random()-0.5)*100`. No historical data is used. | **Reject** |
| KA-3 | NDVI history chart | `islands/NDVIChart.tsx:49-78, 110-130` | **MOCK_ONLY when no observations** | STATIC: "generate estimated historical data" with `Math.random()` NDVI and rainfall, plus random "predictions". | **Reject** |
| KA-4 | Translation and TTS (Sarvam) | `ai/sarvam.ts:70, 124-133, 213-219` | **MOCK_ONLY when no key OR `IS_DEV`** | STATIC: returns `[lang] text` and a non-existent `https://storage.khetscope.app/audio/mock_…` URL. | **Reject** the fallback; Sarvam as a provider is out of scope (its language coverage for Urdu is unverified). |
| KA-5 | Gemini assistant and vision crop analysis | `ai/gemini.ts`, `ai/advisory.ts`, `ai/llm.ts` | IMPLEMENTED_UNTESTED | STATIC: real Vertex AI calls, with model rotation across gemini-1.5/2.0/2.5. | **Reference** for F10 prompt and context design. Generic LLM vision is **not** a validated disease classifier for F01. |
| KA-6 | FCM v1 push sender (service-account JWT → OAuth token → `messages:send`) | `lib/notifications.ts:38-230` | IMPLEMENTED_UNTESTED / PARTIAL | STATIC. | **No delivery tracking**: returns a boolean, persists no per-message delivery row, and handles no receipts. **Reference** for F12. |
| KA-7 | Phone OTP | `lib/auth.ts:467` | Insecure | STATIC: OTP from `Math.random()`, which is not a CSPRNG. `ENABLE_SMS_OTP=false` by default. | **Reject** |
| KA-8 | Ola Maps places | `lib/maps/ola.ts:380-427` | MOCK_ONLY | STATIC: "Return mock data for demo purposes". | **Reject** |
| KA-9 | Demo seed | `db/seed.ts:172-180, 309` | MOCK (seed) | STATIC: random NDVI and prices. These are seed data and must never reach production. | n/a |
| KA-10 | Schema | `db/migrate.ts` (inline, ~1,100 lines) plus `db/migrations/008-010` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** |

- **Config:** `docker-compose.yml` sets `MOCK_SATELLITE_DATA=true` by default. CI runs `deno check` with `continue-on-error` (a comment says "remove continue-on-error once deno check is clean"), so the type-check is known to be failing.
- **Decision: REFERENCE only.** The stack is incompatible (Deno vs FastAPI/Next.js), and there is no license file. Selected ideas (FCM v1 flow, prompt context assembly, weather-risk thresholds) may be re-implemented after the author confirms the license in writing.

---

## 6. AgroTrust (F09/F11/F14 candidate)

- **URL:** https://github.com/ghwmelite-dotcom/AgroTrust · **SHA:** `5239452f…2935` · **License:** MIT
- **Stack:** Cloudflare Workers (Hono 4) + D1 (SQLite) + R2 + KV, Drizzle ORM, Next.js 14 PWA, Dexie offline sync, pnpm/turbo monorepo. Ghana-focused (GHS, MTN MoMo).
- **Tests:** none. **Not launched**: it targets Cloudflare D1/Workers, which is out of our architecture; static audit only.

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| AT-1 | Phone OTP login | `apps/api/src/routes/auth.ts:15-80` | **BROKEN / CRITICAL SECURITY DEFECT** | STATIC: OTP is never sent in non-dev (the SMS call is commented out, lines 38-44). `/otp/verify` accepts `123456` for **any phone in any environment** (lines 63-68: "Demo mode: Accept test OTP"). OTP comes from `Math.random()`. | **Reject** |
| AT-2 | Mobile-money payments | `routes/payments.ts:195-240` | **ROADMAP_ONLY / stub** | STATIC: inserts a `pending` row and returns "You will receive a prompt on your phone" without calling any provider ("NOTE: In production, this would call the actual mobile money API"). Webhook `/callback/:provider` logs the body; there is no signature verification. | **Reject** |
| AT-3 | Credit score (0-850) | `routes/achievements.ts:868`, `buyers.ts:297-312`, `cocoa.ts:124-145` | **Not a credit model** | STATIC: achievements, referrals and training add `totalNewPoints` to `creditScore`. Updates are non-atomic read-modify-writes. | **Reject** scoring. |
| AT-4 | Immutable `credit_events` trail (previous score, new score, reason) | `packages/db/migrations/0000_workable_devos.sql:1`, `routes/farmers.ts:78` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** the pattern for the F14 ledger and AuditEvent. |
| AT-5 | Public `/seed/demo` | `apps/api/src/index.ts:68` | Security defect | STATIC: mounted outside `/api/*` auth, so it is unauthenticated and writes demo data. | **Reject** |
| AT-6 | Offline sync (Dexie) with conflict resolution | `packages/sync`, `routes/sync.ts` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** for the mobile offline-sync design. |
| AT-7 | Harvest records with photo, GPS and timestamp proof | `routes/harvests.ts` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** for the F11 data model. |

---

## 7. Farmiq (F09/F11/F14 candidate)

- **URL:** https://github.com/FARMIQ-T/Farmiq · **SHA:** `7680e4e9…0ba6`
- **License:** MIT (root and `farmiq-ussd/`); `package.json` says ISC.
- **Layout:** the whole Python app is committed **inside `.venv/Include/`**, and the repo tracks 110 `.venv` files, including **38 `.exe` binaries**, `.pyc` files and 6 pickled models. `farmiq-ussd/` is Node/Express + Africa's Talking + Supabase. Kenya-focused (KES, M-PESA).

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| FQ-1 | USSD menu state machine | `farmiq-ussd/services/ussdService.js:18-45`, `databaseService.js:5-25` | **BROKEN** | STATIC: every request calls `createOrUpdateSession(sessionId, phone, {level: 1, data: {}})`, which overwrites the stored `session_data`, so the level-2 menus (loan application, profile update) are unreachable. The next keypress is reinterpreted as a main-menu choice. | **Reject** |
| FQ-2 | USSD callback authentication | `farmiq-ussd/middleware/auth.js` | **BROKEN** | STATIC: `/ussd` requires header `apiKey` equal to the Africa's Talking API key. AT USSD callbacks do not send that header, so real gateway traffic gets a 401. | **Reject** |
| FQ-3 | Loan application via USSD | `ussdService.js` `handleLoanApplication` | BROKEN | STATIC: unreachable (FQ-1). It would also crash on `creditScore.id` when no score exists, has no idempotency (gateway retries duplicate applications), and has no human confirmation. | **Reject** |
| FQ-4 | M-PESA payment | menu text only (`ussdService.js:96`) | ROADMAP_ONLY | STATIC. | **Reject** |
| FQ-5 | Credit-scoring ensemble | `.venv/Include/ai-models/train_credit_model.py`, `data_generator.py` | **MOCK_ONLY** | STATIC: trained on `generate_synthetic_farmer_data(n_samples=1000)` built with `np.random` (`data/farmer_profiles.csv`, 1,000 rows). | **Reject** |
| FQ-6 | Credit-model unit test | `.venv/Include/ai-models/tests/test_credit_model.py` | **BROKEN** | RUN (`python:3.13-slim`, deps per its `requirements.txt`, network disconnected before test execution because the repo ships pickles): `ImportError: cannot import name 'CombineWithReferenceFeature' from 'feature_engine.creation'`. It is incompatible with its own `feature-engine>=1.6.0` pin ([log](../../../banokabal/docs/audit/logs/farmiq_credit_model_test.log)). | n/a |
| FQ-7 | USSD menu wording, Africa's Talking SMS send | `ussdService.js` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** (menu copy only). |

**Security and maintenance:** committed virtualenv and executables (supply-chain risk); pickles must never be loaded outside a sandbox; the npm `"crypto": "^1.0.1"` dependency is a deprecated placeholder package, not Node's built-in module.

---

## 8. Kisan_Rabta (F08/F10 candidate, Pakistan)

- **URL:** https://github.com/faiqfahim/Kisan_Rabta · **SHA:** `30dadb48…bbdbee` (single commit)
- **License:** README says "ISC", but there is **no LICENSE file**. `dashboard/` is TailAdmin (MIT, © 2023 TailAdmin).
- **Layout:** 5,490 tracked files, of which **5,281 are committed `node_modules`**. The pipeline is Node `.mjs` plus a Python `hugchat_script.py`; the dashboard is React/Vite/Supabase. COMSATS final-year project.
- **Tests:** none of its own. The 142 "test" files are inside `node_modules`.

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| KR-1 | Urdu STT of field-agent recordings | `enhanced_pipeline.mjs:55, 108` | **BROKEN (external)** | RUN (HF API): the code calls Space `maliahson/testing`, which now redirects to `maliahson/Final_Year_Project_Pipeline`, status **SLEEPING**. The README's Space `maliahson/Audio_Crop_Disease_Extractor` is in **BUILD_ERROR**. That Space's `app.py` uses stock `openai/whisper-large-v3-turbo` (MIT) plus GLiNER (`xomad/gliner-model-merge-large-v1.0`, Apache-2.0), not a fine-tuned model as the README claims. | **Reference** the approach (Whisper-large-v3-turbo for Urdu, which we must evaluate ourselves); **reject** the dependency on a personal Space. |
| KR-2 | Urdu→English translation and crop/disease extraction | `hugchat_script.py` | **Unacceptable dependency** | STATIC: uses `hugchat`, an unofficial reverse-engineered HuggingChat client, authenticated with exported browser `cookies.json` (`.env.example` also asks for an account email and password). | **Reject** |
| KR-3 | Supervisor dashboard (Pakistan map, crop/disease charts) | `dashboard/src` | IMPLEMENTED_UNTESTED | STATIC. | **Reference** for Pakistan admin-boundary visuals. |
| KR-4 | Mobile app (React Native field recorder) | described in README | **NOT_FOUND** | Not in the repo. | n/a |
| KR-5 | Market prices | — | NOT_FOUND | — | — |

**Security:** a Supabase `anon` JWT (project `lyphvwnzvnfjlrrvzwuo`, expires 2035) is hardcoded in `dashboard/src/lib/supabase.ts`. Anon keys are designed to be public, so the real exposure depends on that project's Row-Level Security, which we did not probe because it is a third party's system. Severity: medium, owner should be informed.

---

## 9. Crop-Yield-Prediction-System (F13)

- **URL:** https://github.com/AmiNilay/Crop-Yield-Prediction-System · **SHA:** `98953416…cbd9e`
- **License:** README says "MIT" and links to `LICENSE`, but **that file does not exist**.
- **Stack:** Python, XGBoost 3.x, scikit-learn 1.7.2 (pinned), SHAP, FastAPI, Streamlit. LFS for CSVs and the pickle (materialised correctly).
- **Data:** `india_crop_production_district.csv` (246,091 rows, the public data.gov.in district crop-production table, 1997-2015) and a 50,000-row state-level sample; state-level fertilizer and irrigation tables; NASA POWER weather. These are **real public observations, not synthetic**. **India only: no Pakistani provinces.**

| # | Capability | Location | Status | Evidence | Decision |
|---|---|---|---|---|---|
| CY-1 | XGBoost yield prediction (q/ha) | `src/pipeline/predict_pipeline.py`, `models/model.json`, `models/preprocessor.pkl` | IMPLEMENTED_AND_TESTED (smoke) | RUN in `python:3.12-slim`: `scripts/test_prediction.py` → "Prediction: 25.66 q/ha SUCCESS". | **Reference** |
| CY-2 | REST API | `api/main.py` | IMPLEMENTED_UNTESTED | RUN: app imports with 15 routes (`/api/v1/predict`, `/forecast`, `/risk`, …). The server was not exercised. | **Reference** |
| CY-3 | Forecast-driven seasonal features | `src/components/forecast_data.py`, `scripts/test_forecast.py` | **PARTIAL (methodologically unsafe)** | RUN: Punjab Kharif forecast covered **10.6%** of the season (9-day horizon), yet season "total_precipitation" was reported as **−96% vs historical** and would be fed to the model as a whole-season feature. | **Reject** the method as-is. |
| CY-4 | Train/test validation | `models/model_metadata.json`, `scripts/compute_metrics.py` | PARTIAL | STATIC: random 80/20 split on panel time series (state × crop × year), so information leaks across years. Reported R² 0.9165 but **MAPE 40.8%**. The pooled R² is inflated by between-crop scale differences. `production` is correctly excluded (no direct target leakage). | **Reference**; F13 needs temporal and spatial hold-out validation. |
| CY-5 | `scripts/verify_match.py` | | **BROKEN** | RUN: `ValueError: Found array with 0 sample(s)` from `SimpleImputer`. | n/a |
| CY-6 | Artifacts | `models/` | PARTIAL | `rice_yield_predictor.joblib` is a **0-byte file**. Metadata references `model.pkl`/`model.ubj`, which are not in the repo; the loader falls back to `model.json` and works. | n/a |

Log: [logs/crop_yield_scripts.log](../../../banokabal/docs/audit/logs/crop_yield_scripts.log).

---

## Cross-cutting security findings

| Sev | Repo | Finding | Location | Relevance to Fasal Guard |
|---|---|---|---|---|
| **Critical** | AgroTrust | Universal OTP `123456` accepted for any phone in any environment (account takeover). | `apps/api/src/routes/auth.ts:63-68` | Never copy. Our OTP design must use a CSPRNG, hashed storage, attempt limits and expiry. |
| **Critical** | OpenFarm | 3 critical npm advisories in direct deps (`next`, `next-auth`, `maplibre-gl`), plus 9 high. | `apps/web/package-lock.json` | Upgrade before go-live (fixes available). |
| High | OpenFarm | Farmer scouting photos are anonymously downloadable. | `docker-compose.yml` minio-init (`mc anonymous set download …/photos`) | Make private; serve via short-lived presigned GET. |
| High | OpenFarm | JWT secret falls back to `"change-me"`. | `apps/web/src/app/api/auth/token/route.ts:7-9` | Fail closed at startup. |
| High | AgroTrust | Unauthenticated `/seed` route writes to the DB. | `apps/api/src/index.ts:68` | n/a (rejected) |
| High | Farmiq | Committed `.venv` with 38 `.exe` files and pickled models. | `.venv/` | Never execute; never unpickle outside a sandbox. |
| Medium | OpenFarm | Upload extension taken from the client filename; presigned PUT doesn't bind content-type or size. | `services/api/app/routers/uploads.py:52` | Fix in F01 intake. |
| Medium | OpenFarm | `python-jose` (unmaintained, published CVEs) used for JWT verification. | `services/api/pyproject.toml` | Replace with PyJWT or joserfc. |
| Medium | OpenFarm | FTW checkpoint unpickled from MinIO without a hash check. | `tasks/detection.py:183-264` | Pin SHA-256. |
| Medium | kissan-alert, AgroTrust | OTP or reference codes from `Math.random()`. | `lib/auth.ts:467`; `auth.ts:15` | n/a (rejected) |
| Medium | Kisan_Rabta | Hardcoded Supabase anon key; unofficial cookie-auth LLM client. | `dashboard/src/lib/supabase.ts`; `hugchat_script.py` | n/a (rejected) |
| Medium | AgroTrust | Payment webhook with no signature verification. | `routes/payments.ts:236-243` | Our F09 webhooks must verify signatures and be idempotent. |
| Low | botanix | Clerk `pk_test_` publishable key in history. | git history | n/a |

## Maintenance concerns

| Repo | Concern |
|---|---|
| OpenFarm | Single active maintainer (117 commits, burst activity 2026-08-12/14). No tests. Unpinned Python deps and `latest` MinIO images. |
| botanix | 11 commits, academic thesis project, inactive since 2025-06 apart from a README update. |
| pyfao56 | Healthy: USDA-ARS maintainer, 296 commits, peer-reviewed method. |
| pywapor | Healthy: FAO, 862 commits. Pins `numpy<2` and `pandas<3`. |
| kissan-alert | 61 commits; type-check known to fail (CI continue-on-error). |
| AgroTrust | 45 commits; many TODO stubs. |
| Farmiq | 9 commits; hackathon-quality; committed virtualenv. |
| Kisan_Rabta | 1 commit; committed `node_modules`; external Spaces dead or sleeping. |
| Crop-Yield | 25 commits; solo portfolio project. |

## Runs not performed in Phase A, and why

| Item | Reason | When |
|---|---|---|
| OpenFarm full stack, migrations, endpoints, STAC run, map layers | This is Phase B scope. | Phase B |
| OpenFarm `ruff`, web `tsc`, Python `pip-audit` | Need the built images; will run against the Phase B build. | Phase B |
| pywapor end-to-end | Blocked: CDS, Copernicus Data Space, Earthdata (and others) credentials. | When the owner supplies accounts |
| AgroTrust, botanix, Kisan_Rabta, Farmiq Streamlit launch | Rejected or reference-only on static evidence that is already decisive (fabricated or stub paths). Launching would not change the decision. | Not planned |
| Any probing of third-party live systems (Kisan_Rabta Supabase, sleeping HF Space) | Not ours; not authorised. | Never |
