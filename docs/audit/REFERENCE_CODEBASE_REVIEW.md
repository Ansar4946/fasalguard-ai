# Eight reference repositories: codebase review

Date: 2026-10-13. Fresh static reading of the eight reference projects in `banokabal`. OpenFarm is the separate base repository. Entry points, manifests, licenses, key business paths and tests were inspected directly. This does not claim every line was read. Vendored dependencies, generated documentation, datasets and binary assets are excluded. No tests/providers were executed and no reference code was modified/imported.

See WORKSPACE_REVALIDATION.md for commit versions. REFERENCE_SOURCE_INVENTORY.tsv lists tracked source/manifests/tests; inventory inclusion does not mean individual review. Earlier runtime results remain historical evidence.

## botanix-mobile-ai

Expo Router / React Native app; `package.json` starts through `expo-router/entry`; `app/_layout.tsx` installs providers. `app/(tabs)/create.tsx` selects an image and calls `services/PlantDiseaseService.ts:classifyImage()`. Initialization marks the model ready without loading a model. Classification calls `simulateInference()`, checks image URI strings and returns hardcoded diseases with random confidence values. Declared TFLite/ONNX dependencies do not establish inference.

`app/(tabs)/chats.tsx` calls `PLLaMaService.askPlantQuestion()` -> `generateResponse()`, which returns a fixed API-unavailable message with `success: true`. Its private Hugging Face API helper is not reached on that public path. This corrects the earlier audit's implication that the public assistant actually calls that provider.

Decision: reference capture/results UX for F01/F06; reject current diagnosis/assistant claims. Root MIT code license; model licensing remains separate. Jest is declared but no application test files were identified.

## pyfao56

Scientific Python library with pandas/numpy/matplotlib/requests dependencies in `setup.cfg`. Root LICENSE.md states public-domain/CC0 dedication. `src/pyfao56/model.py:Model.run()` advances daily crop/soil state; `_advance()` computes stage coefficients, root depth, ET, irrigation efficiency, runoff and effective precipitation. `refet.py:ascedaily()/ascehourly()` calculate reference ET. `autoirrigate.py:AutoIrrigate.addset()` configures depletion, forecast rain and scheduling controls. Supporting modules manage weather, parameters, irrigation, soil layers and updates.

`tests/test09/cotton2018.py:run(case=0, plot='p06-1')` is parameterized, loads study fixtures and writes outputs into its own directory. Run regressions on an export to preserve clones. Scenario-specific output comparisons matter; historical test09 matching was not rerun here.

Decision: strongest F03 library candidate, pinned and wrapped by the existing Python service. Requires unit validation, soil/crop/weather inputs and Pakistan calibration before recommendations.

## fao-wetl-pywapor

Python/xarray/GDAL pipeline. `pyproject.toml`: Apache-2.0, Python >=3.10, numpy<2 and pandas<3. `pywapor/main.py` defines Configuration and Project; `download_data()` collects provider inputs with buffered dates. Processing: `run_pre_se_root()` -> `run_se_root()` -> `run_pre_et_look()` -> `run_et_look()`. `se_root.py` estimates root moisture; `et_look.py:main()` invokes scientific equation modules and exports evaporation, transpiration, actual/reference ET and biomass.

`tests/main_test.py:test_data_download()` requests accounts/passwords and downloads provider data; subsequent processing tests reuse that flow. This is not an offline unit suite.

Decision: asynchronous F03 seasonal ET/water-productivity worker candidate. Needs provider accounts, compatible GDAL image, resource limits, provenance and field aggregation. No live processing verified here.

## kissan-alert-solution

Deno/Fresh/Preact + PostgreSQL/PostGIS. `deno.json` defines web/worker/migration tasks and disables locking. `main.ts` installs cron/KV handlers on Deno Deploy; `workers/main.ts` polls a database queue and dispatches imagery, feature extraction, advisories and market jobs.

`lib/satellite/market.ts:getAgmarknetPrices()` calls an Indian provider then falls back. `parseENAMResponse()` returns an empty list; cached/static fallback fabricates prices; `getPriceTrend()` uses random changes; nearby mandi distance is random. These cannot supply F07 Pakistan observations.

`ai/llm.ts` routes text/image calls to configured providers with Gemini fallback; audio always uses Gemini. `ai/advisory.ts:generateAdvisories()` builds crop, imagery, health and forecast context for rules. `ai/sarvam.ts` contains real requests plus cached mock translation/audio paths; its language map has no Urdu entry. `lib/notifications.ts:sendPushNotification()` counts FCM submission successes/failures, not device delivery receipts.

Additional static defect: `workers/kv-queue.ts:startQueueListener()` retries through `enqueue()`, which resets attempts to zero. Repeated failures can continue retrying without reaching the intended limit.

`tests/farm_test.ts` and `tests/satellite_test.ts` test inline functions/arithmetic rather than importing production modules. Historical passing tests do not cover business/provider paths.

Decision: reference F04/F10 context/rules and F12 sending flow. No root LICENSE file; code copying remains deferred under project policy.

## AgroTrust

Hono/Cloudflare Workers + D1/Drizzle, KV/R2, Next.js and Dexie. `apps/api/src/index.ts` protects `/api/*` but separately exposes `/auth` and `/seed`. `routes/auth.ts` accepts OTP 123456 without an environment restriction; production SMS is commented out. Session validation in `middleware/auth.ts` cannot repair this bypass.

`routes/harvests.ts` checks farm ownership for fetching/creating harvests. `routes/payments.ts` creates pending rows but initiation is a stub; callbacks lack signature verification. `packages/sync/src/offline-db.ts` defines Dexie tables; `sync-engine.ts` implements push/pull/conflicts, removing pending changes after three transport failures and marking records failed.

Additional authorization defects: `routes/sync.ts` returns sync-log changes filtered by timestamp without farmer filtering. `applyChange(db, farmerId, ...)` never uses farmerId; updates/deletes filter only by ID; inserts spread client data without forcing ownership. `/push` and `/resolve` reach that helper. Static trace therefore identifies cross-farmer read/write exposure; no live exploit was attempted.

Decision: reference harvest/audit schemas and offline concepts for F11/F14. Reject existing sync/auth/payment implementation. MIT root code license; no application suite identified.

## Farmiq

Express/Supabase/Africa's Talking USSD plus Python/Streamlit/ML inside `.venv/Include/`. `farmiq-ussd/index.js` mounts USSD/payment routes; npm test deliberately exits with failure.

`services/ussdService.js:handleUSSDSession()` initializes level 1/empty data on every request; `databaseService.js:createOrUpdateSession()` overwrites state. Loan/profile follow-ups cannot retain their intended state. `middleware/auth.js` requires an apiKey header; live callback compatibility is unverified. Loan creation has no explicit confirmation/idempotency key.

Additional launch blocker: databaseService requires `../config/supabase`, but `farmiq-ussd/config/supabase.js` is absent from the clone.

Correction to earlier audit: M-PESA is not only menu text. `routes/routes.js` has sandbox OAuth/STK push/query/callback calls. However, it references Fine and Payment without declarations/imports and fails on those paths. It is not working integrated USSD finance or a Pakistan payment provider.

`ai-models/data_generator.py` generates synthetic farmers/labels; `enhanced_credit_scoring.py` trains from it in its executable example. Separately, `train_credit_model.py:DynamicCreditScorer` fetches Supabase data and preprocesses before splitting, creating a validation-leakage concern. Distinguish these paths rather than describing every scorer as the synthetic ensemble. `ai_service/main.py` loads serialized artifacts at startup; none were loaded here.

Decision: menu/reference concepts only; reject credit-readiness claims and current sessions/payments. Root MIT versus npm ISC metadata conflict.

## Kisan_Rabta

Batch Node/Gradio/Python/Supabase pipeline plus React/Vite supervisor dashboard and Express/Socket.IO reporting backend. `dashboard/src/App.tsx` maps sign-in, dashboard, recordings, analytics and Pakistan map routes.

`enhanced_pipeline.mjs` reads Google service-account configuration, lists/downloads Drive recordings, calls Gradio `/pipeline_fn` on maliahson/testing, checks processed files and writes Supabase transcriptions/issues. `hugchat_script.py` uses exported browser cookies for translation/entity extraction. It asks a chatbot for numeric weather temperature; this is not a meteorological observation.

`dashboard/backend/server.js` requires local userService.json, generates/copies analytics and folder data and emits update events. Credentials/deployment inputs are required.

Decision: reference Urdu extraction workflow and Pakistan visuals for F08/F10; replace external/cookie dependencies. No root project license; dashboard template licensing does not cover all pipeline code. No dedicated application tests identified. Remote Space availability was not checked; historical availability claims are not current verification.

## Crop-Yield-Prediction-System

Python/XGBoost/sklearn training/inference + FastAPI + Streamlit. `api/main.py` changes working directory to the project root and loads artifacts/schema. PredictionRequest constrains crop_year to 1997-2015, excluding current-season requests as written.

`src/pipeline/predict_pipeline.py:PredictPipeline` loads a preprocessor/native booster with pickle fallback, enriches missing weather/irrigation/fertilizer features, transforms and predicts. CustomData builds a feature row with optional farmer overrides. `data_transformation.py` excludes production from features and fits preprocessing on training data. `data_ingestion.py` randomly splits records; `model_trainer.py` uses grid-search CV. Neither establishes temporal/spatial validation for Pakistan.

Correction to older audit: `forecast_data.py` annualizes available-sample rainfall to match its historical feature format, rather than simply treating the short-window sum as a season total. Extrapolating a short sample remains unvalidated. coverage_pct is season-filtered points divided by all returned forecast points, not the full season's expected count; the label needs careful interpretation.

Decision: F13 pipeline reference only; needs licensed Pakistan data/artifacts, unit contracts, retraining and time/location holdouts. No root LICENSE file. Smoke-test scripts exist; no predictions/artifacts executed here.

## Integration implications

| Feature | Source decision |
|---|---|
| F01/F06 | Botanix UX reference; no working reviewed offline diagnosis path |
| F03 | pyfao56 library candidate; pywapor isolated worker candidate |
| F04/F10 | kissan-alert rules/context reference |
| F07 | No verified reusable Pakistan price source in reviewed reference paths |
| F08 | Kisan_Rabta workflow reference; replace provider dependencies |
| F09/F11 | Farmiq incomplete; needs confirmed/idempotent secure design |
| F11/F14 | AgroTrust schema concepts; reject unsafe auth/sync/payment paths |
| F12 | kissan-alert submission flow; delivery tracking still missing |
| F13 | Crop-Yield pipeline reference; regional/license/validation gaps |

This source review does not complete the runtime audit or OpenFarm baseline gate. Application implementation remains deferred by the user's Phase A instructions.