> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Fasal Guard — Dependency Audit (Phase A)

Audit date 2026-10-13. "Declared" means taken from manifests. "Resolved" means installed and observed in our runs.

## OpenFarm (base): what we would inherit

### API / workers (`services/api/pyproject.toml`)

| Dependency | Declared | Concern |
|---|---|---|
| fastapi, uvicorn[standard], pydantic v2, pydantic-settings | `>=` floors | **No lockfile**; every build resolves fresh, so builds are not reproducible. Add `uv.lock` or pinned `requirements.lock`. |
| sqlalchemy[asyncio] 2, asyncpg, psycopg2-binary, alembic, geoalchemy2 | `>=` | Two drivers (async for the API, sync for Celery/Alembic). OK. |
| celery[redis] ≥5.4, redis ≥5 | `>=` | **No beat service runs** (see audit OF-8). |
| python-jose[cryptography] ≥3.3 | `>=` | ⚠ Effectively unmaintained, with published CVEs (algorithm confusion, JWE DoS). Replace with PyJWT or joserfc. |
| rasterio, rio-cogeo, pystac-client, shapely, pyproj, owslib, numpy | `>=` | Needs GDAL system libraries (Dockerfile installs `libgdal-dev`). |
| minio ≥7.2, httpx, structlog, slowapi, rosetta-soil, geojson, python-multipart | `>=` | OK |
| dev: ruff | `>=` | No test runner declared (no pytest at all). |

### ML worker (`services/api/requirements-ml.txt`, `Dockerfile.ml`)

torch==2.6.0 and torchvision==0.21.0 (CPU index), ftw-tools≥1.4.3, torchgeo≥0.7,<0.9 (code monkey-patches `AugmentationSequential`), kornia, timm. The image is ~800 MB+ per the file's own comments. The Dockerfile runs `pip install -e ".[all]" 2>/dev/null || pip install .`, which **swallows install errors**, and there is no `[all]` extra defined.

### Web (`apps/web/package.json`, locked versions from `package-lock.json`)

| Package | Locked | Note |
|---|---|---|
| next | 14.2.35 | Past the CVE-2025-29927 middleware-bypass fix. **Still flagged critical** by npm audit (Image Optimizer DoS; RSC deserialization DoS). |
| next-auth | 4.24.13 | **Critical**: email normaliser homoglyph bypass; `getToken()` crash on malformed Bearer. |
| maplibre-gl | 4.7.1 | **Critical**: XSS sanitizer bypass. |
| @mapbox/mapbox-gl-draw | ^1.4.3 | — |
| echarts | ^5.5 | Moderate XSS advisory. |
| postcss, tailwindcss | — | High (transitive via chokidar/braces/micromatch). |
| next-intl | ^4.8.2 | — |
| pg | 8.18.0 | Direct DB access from web, used only for the user upsert. |
| jose | 5.10.0 | JWT minting. |

`npm audit --omit=dev`: **20 vulnerabilities (3 critical, 9 high, 7 moderate, 1 low)**, all with fixes available. Full list: [logs/openfarm_web_npm_audit.txt](../../../banokabal/docs/audit/logs/openfarm_web_npm_audit.txt).

### Containers

| Image | Pin | Concern |
|---|---|---|
| imresamu/postgis:16-3.4 | tag | Third-party multi-arch rebuild of postgis/postgis. Acceptable, but prefer the official image on amd64 or pin the digest. |
| redis:7-alpine | major | OK |
| minio/minio:latest, minio/mc:latest | ⚠ `latest` | Unpinned. MinIO has changed its community-edition distribution and licensing posture, so pin a digest and re-evaluate. |
| python:3.12-slim (API, ML) | minor | OK |

### External services OpenFarm needs at runtime

| Service | Credential | Required for |
|---|---|---|
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Any login at all** |
| Element84 Earth Search (STAC) | none | Satellite indices, boundary detection |
| Open-Meteo forecast and archive | optional `open_meteo_api_key` (required for commercial use) | Weather |
| ISRIC SoilGrids WCS | none | Soil |
| AWS S3 POLARIS (US only) | none (public bucket) | Soil (US) |
| Resend | `RESEND_API_KEY` | Invite emails |
| Own: Postgres, Redis, MinIO, TiTiler | secrets from `.env` | Everything |

## Reference repos: dependencies relevant to reuse decisions

| Repo | Runtime | Key dependencies (resolved where we ran it) | Compatible with target stack? |
|---|---|---|---|
| pyfao56 1.4.3 | Python ≥3.7 | numpy, pandas, matplotlib, requests, urllib3. Resolved OK with **numpy 2.5.4 / pandas 3.0.6 / Py 3.14.7** and numpy 2.3.5 / pandas 2.3.3. Undeclared: `geojson` (tests only). | ✅ Yes (pure Python). matplotlib is a heavy import for a worker. |
| pywapor 3.7.3 | Python ≥3.10 | gdal>=3,<4, **numpy<2**, **pandas<3**, netcdf4, xarray, rioxarray, dask, numba, pycurl, cdsapi, scikit-learn, … Resolved via conda-forge: Py 3.12, GDAL 3.13.3, numpy 1.26.4. Needed `coverage>=7.4` to avoid a numba import crash under pytest. | ⚠ Only in an **isolated worker image**; its numpy/pandas caps conflict with a modern API image. |
| Crop-Yield | Python 3.10+ | numpy≥2, pandas≥2.2, scikit-learn==1.7.2, xgboost≥2.1, shap, fastapi, streamlit, plotly, seaborn. Resolved: xgboost 3.4.1, shap 0.53.0, sklearn 1.7.2, numpy 2.5.4, pandas 3.0.6. `preprocessor.pkl` is version-bound to sklearn 1.7.2. | ✅ Python/FastAPI-compatible, but reference only. |
| kissan-alert | Deno 2 / Fresh 1.6 / Preact | Postgres job queue, Gemini via Vertex, Sarvam, FCM v1 | ❌ Different runtime. Port ideas only. |
| AgroTrust | Cloudflare Workers / Hono / D1 (SQLite) / Drizzle / Next 14 / Dexie | — | ❌ D1/SQLite contradicts "PostgreSQL as single source of truth". |
| Farmiq | Python 3.13 Streamlit; Node/Express 5 + africastalking 0.7.7 + Supabase | npm `crypto@^1` (deprecated placeholder); feature-engine (API removed, test broken) | ❌ Supabase is a second backend. |
| Kisan_Rabta | Node (`.mjs`) + Python `hugchat` + React/Vite + Supabase | `@gradio/client`, `googleapis` (Drive), `hugchat` | ❌ |
| botanix | Expo 53 / RN 0.79 / React 19 | `react-native-fast-tflite` 1.6, `onnxruntime-react-native` 1.22 (both unused), `convex`, `@clerk/types`, `svix`, `aws-sdk` (dev) | ⚠ Expo/RN fits our mobile target, but its inference stack is unused and must be built from scratch. |

## New dependencies implied by the 14 features (no decisions yet; for Phase C)

| Need | Candidate | Note |
|---|---|---|
| On-device inference (F06) | `react-native-fast-tflite` or LiteRT, with a model we train and convert ourselves | Requires a real, validated `.tflite` and a parity test against the server model. |
| Irrigation (F03) | `pyfao56==1.4.3` | Pin exactly. |
| Water productivity (F03) | `pywapor==3.7.3` in its own image | Optional, P2+. |
| STT/TTS (F08) | Whisper-large-v3-turbo (MIT) self-hosted or a managed STT; TTS provider TBD | Urdu/Punjabi/Saraiki/Sindhi quality must be measured; nothing in the source repos covers TTS for Urdu. |
| USSD/SMS (F09/F11/F12) | Pakistani aggregator or operator API | No source repo supports a Pakistani gateway. Commercial agreement needed. |
| RAG (F10) | pgvector | Only if retrieval is actually used (per project principle). |
