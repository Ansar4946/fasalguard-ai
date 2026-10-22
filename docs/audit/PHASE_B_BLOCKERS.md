> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Phase B Blockers and Phase C Recommendations

Date 2026-10-13. Evidence for every item is in `OPENFARM_BASELINE.md` (§ refs), `SATELLITE_NUMERICAL_VALIDATION.md` (S#), `AUTH_IDENTITY_GAP.md` (A#) or `LEGACY_FASALGUARD_INVENTORY.md` (L#).

## 1. Blockers found in OpenFarm as shipped

| ID | Severity | Blocker | Evidence | Class | Fix direction (Phase C/E, not done) |
|---|---|---|---|---|---|
| B1 | **Critical (launch)** | Migrations and all Celery DB access fail: unpinned SQLAlchemy resolves 2.1.4 → default driver psycopg v3, which isn't installed. The API then starts anyway and reports healthy. | §1, §2 | RUN_FAIL | Pin dependencies with a lockfile; explicit `+psycopg2` (or install psycopg 3); fail the container if migrations fail; add a readiness probe that checks `alembic_version`. |
| B2 | **Critical (launch)** | `minio/minio` and `minio/mc` images are no longer pullable from Docker Hub or quay.io | §1 | RUN_FAIL | Choose a maintained S3-compatible image (and license) and pin by digest. Chainguard MinIO worked as a drop-in for testing. |
| B3 | High | Non-reproducible builds: web Dockerfile ignores `package-lock.json`; Python deps are floor-only; ruff unpinned, so CI fails with 213 errors on a fresh run | §10 | RUN_FAIL | `npm ci` with the lockfile; Python lockfile; pin tool versions. |
| B4 | High | No `celery beat` anywhere, so scheduled weekly index and daily weather jobs never run | §7 J4 | STATIC_VERIFIED | Add a single beat service (or an external scheduler) with a lock. |
| B5 | **High** | Dispatch-before-commit race: jobs stuck `pending` forever (reproduced via weekly schedule, 16/16, and via API detection) | §7 J7–J9 | RUN_FAIL | Commit before dispatch (or an outbox pattern); worker retry on missing job; stuck-job sweeper. |
| B6 | High | FTW checkpoint (`prue_efnetb5_ccby`, release v3.1) is incompatible with `ftw-tools 1.4.3` + Lightning 2.6.6; provisioning step undocumented | §6 | RUN_FAIL | Pin a mutually compatible `ftw-tools`/checkpoint pair by hash; document provisioning; then test accuracy on Pakistani fields. |
| B7 | **High (security)** | TiTiler serves any org's COG to any valid token (cross-tenant disclosure, reproduced) | A10 | RUN_FAIL | Authorise path-to-org in the tiler, or serve tiles via API-signed short-lived URLs. |
| B8 | High (security) | TiTiler SSRF: opens arbitrary URLs, including internal services | A11 | RUN_FAIL | URL allow-list (own bucket only); block `/vsicurl/` to internal hosts. |
| B9 | **High (privacy/security)** | Scouting uploads are public (anonymous GET 200), and the presign accepts any content type and extension (HTML/JS served as `text/html`) | §3 | RUN_FAIL | Private bucket; presigned GET; bind content-type and size in the presigned policy; server-side extension from MIME. |
| B10 | High (science) | EVI/SAVI computed on DN (wrong); no nodata or SCL cloud masking, so false 106%/73% NDVI-drop alerts on real scenes; phenology-blind drop rule; constant `quality_score` | S6–S13 | RUN_FAIL | See satellite report §7. |
| B11 | Medium | No coordinate-range validation (lon 200° accepted, 526,677 ha) | §3 | RUN_FAIL | Validate WGS84 ranges and a maximum area. |
| B12 | Medium | Weather: today dropped and UTC "today"; zeros reported as facts when there's no data; silent `[]` on provider failure; no weather alerts | §5 | RUN_FAIL / STATIC | Local-timezone days; nulls plus explicit `unavailable` states; weather alert rules (frost/heat/heavy rain). |
| B13 | Medium | `python-jose` CVE; `"change-me"` secret fallback; no `iss`/`aud`; shared HS256 secret across 3 services; share token copied into audit metadata | A12–A14 | RUN_FAIL / STATIC | See `AUTH_IDENTITY_GAP.md` §3. |
| B14 | Medium | npm audit: 3 critical, 9 high in direct deps (`next`, `next-auth`, `maplibre-gl`) | §10 | RUN_FAIL | Upgrade. |
| B15 | Structural | Identity is Google + email only; `users.email NOT NULL`, no phone. Feature-phone farmers can't exist. | A1, §2 of AUTH | STATIC_VERIFIED | Phone-first identity design (`AUTH_IDENTITY_GAP.md`). |
| B16 | Environment | Docker Desktop VM restarted itself mid-test (cause undetermined); 5.7 GiB VM, 21 GB free disk | `DOCKER_RESOURCE_REPORT.md` §5 | — | ≥ 8 GiB to Docker; worker memory limits; keep ≥ 20 GB free. |

## 2. Externally blocked items

| Item | Needed from owner | Class |
|---|---|---|
| Google browser login, authenticated UI and map screenshots | Google OAuth client (ID + secret), redirect URI `http://localhost:3000/api/auth/callback/google` | BLOCKED_CREDENTIALS |
| Invite email | Resend API key (or swap provider) | BLOCKED_CREDENTIALS |
| pyWaPOR integration tests | CDS, Copernicus Data Space, NASA Earthdata accounts (deferred by decision) | BLOCKED_EXTERNAL_CREDENTIALS |
| Commercial weather use | Open-Meteo commercial key | BLOCKED_CREDENTIALS (production) |
| AMIS mandi data (legacy app) | Written permission and terms from AMIS Punjab | external/legal |

## 3. The decision Phase C must make first: which base?

| | OpenFarm (Phase A choice) | Legacy FasalGuard (`fasalguard-ai-restored`) |
|---|---|---|
| Stack | FastAPI + Next 14 + Celery | NestJS 11 + Next 16 + BullMQ |
| Matches the stated target stack | **Yes** (FastAPI/Python ML) | No |
| Tests | **0** | 62 spec files (not run) |
| Launches as shipped | **No** (B1, B2) | Not tested (read-only); bind mounts point to an empty folder |
| Geospatial pipeline | Real STAC/COG/TiTiler, verified end-to-end; defects B10 | Sentinel Hub (credentials) with SCL; not verified |
| Pakistan market data | none | AMIS scraper (disabled, terms pending) |
| Identity | Google-only; sound tenancy (A6–A9 pass) | phone/email + sessions, but **no-secret login (critical)** |
| Weather alerts | none | rules engine present |
| Uncommitted work | — | 11 files of SMS/Twilio WIP |

**Recommendation:**
1. Keep **OpenFarm as the base**, per the original architecture. Its tenancy model passed every authorisation test, and its geospatial pipeline is real and now quantified.
2. Treat the legacy app as a **reference source** for AMIS ingestion, weather alert rules, the refresh-token rotation design, and the Pakistan/Urdu product scope. Port these after a license and ownership confirmation (it's your own repo, so ownership is likely fine). **Do not port its login.**
3. Revisit this only if you'd rather standardise on NestJS. That would mean re-validating the legacy stack from scratch, at least Phase B depth.

## 4. Recommended Phase C entry sequence

1. **Decide the base** (above) and the S3 image (B2).
2. Write the Phase C architecture docs (`SYSTEM_DESIGN.md`, `DATA_MODEL.md` including the phone-first identity model, `API_CONTRACTS.md`, `FEATURE_MATRIX.md`, `INTEGRATION_PLAN.md`), carrying B1–B16 as P0 prerequisites.
3. Make P0 "make it launchable and testable" the first implementation work package (Phase E): lockfiles and pins (B1, B3), S3 image (B2), beat (B4), commit-before-dispatch (B5), the first pytest suite (authz matrix from `api_baseline.py`, satellite golden values from `satellite_validate.py`), and CI that actually runs tests.
4. Then the security fixes B7–B9 and B13, then science fixes B10–B12, before any F01–F14 feature work.

## 5. Phase B environment state (left as-is)

- `fasalguard-phaseb` stack: 7 services running (ml-processor stopped). Stop it with `docker compose -p fasalguard-phaseb stop` from `D:\banokabal\phaseb\openfarm`. Volumes contain only test fixtures (`@phaseb.test` users, a Faisalabad test field, COGs, the FTW checkpoint).
- `D:\banokabal\phaseb\openfarm\.env` holds **generated local secrets**. It's not in any git repo; don't commit or share it.
- Legacy `fasalguard` containers and volumes: untouched, stopped.
- All nine source clones: unmodified.
