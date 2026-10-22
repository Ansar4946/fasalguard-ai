> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Fasal Guard — Real vs Mock (Phase A)

Audit date 2026-10-13. For each required feature, this lists what *actually* exists across the nine repositories, separating real implementations from fabricated output. Capability IDs (e.g. `OF-5`) refer to [REPOSITORY_AUDIT.md](REPOSITORY_AUDIT.md). **RUN** = we executed it; **STATIC** = established from code (file:line in the audit).

## Feature coverage at a glance

| Feature | Best real source | Its status | Fabricated paths found | Net position |
|---|---|---|---|---|
| F01 Crop disease image diagnosis + risk | none | — | botanix BX-1 (random), kissan KA-5 (generic LLM vision, real but unvalidated) | **NOT_FOUND** (no validated classifier anywhere). Image intake exists in OpenFarm OF-11. |
| F02 Satellite NDVI/EVI/NDWI, history | OpenFarm OF-5 | **PARTIAL** (EVI/SAVI wrong; no cloud mask) | kissan KA-3 (random NDVI chart) | Real base; must fix before trusting values. |
| F03 Irrigation + water productivity | pyfao56 PF-1/PF-2; pywapor PW-2 | **IMPLEMENTED_AND_TESTED** (pyfao56); pywapor tests **BLOCKED on credentials** | — | Strongest reusable science. OpenFarm OF-9 is ET₀−P only. |
| F04 Weather forecast + alerts | OpenFarm OF-7 | **PARTIAL** (silent failure; daily job never runs; no weather alerts) | — | Real provider integration; alerts missing. |
| F05 Farm mapping, boundaries, GPS, PostGIS | OpenFarm OF-3, OF-4 | **IMPLEMENTED_UNTESTED** | — | Best-covered feature. Runtime verification is Phase B. |
| F06 Offline mobile disease inference | none | — | botanix BX-1/BX-2/BX-4 (fake inference, invalid/zero models) | **NOT_FOUND.** Only real asset: upstream PyTorch weights (license unclear). |
| F07 Pakistani mandi prices + trends | none | — | kissan KA-1/KA-2 (fabricated India prices and random-walk trends) | **NOT_FOUND.** No Pakistani price source in any repo. |
| F08 Urdu/Hindi/English STT + TTS | Kisan_Rabta KR-1 (approach only) | **BROKEN (external Space dead/sleeping)** | kissan KA-4 (mock translation and TTS URL) | **NOT_FOUND** as working code. Whisper-large-v3-turbo is a candidate to evaluate. No TTS anywhere for Urdu. |
| F09 Voice + USSD financial transactions | none | — | AgroTrust AT-2 (stub payment, false prompt message); Farmiq FQ-1/2/3/4 (broken/roadmap) | **NOT_FOUND** working; references only. |
| F10 Multilingual context-aware assistant | kissan KA-5 | **IMPLEMENTED_UNTESTED** (Deno; no license file) | botanix BX-5 (DialoGPT via retired API) | Reference prompt/context design only. |
| F11 Harvest/sales via feature phone | AgroTrust AT-7 (smartphone/PWA only) | IMPLEMENTED_UNTESTED (reference) | Farmiq FQ-1 (broken USSD) | **NOT_FOUND** for feature phones. |
| F12 SMS/push with delivery tracking | kissan KA-6 (FCM send) | **PARTIAL** (no delivery tracking) | — | Sender reference only; tracking must be built. OpenFarm has email invites only. |
| F13 Yield prediction with validation | Crop-Yield CY-1 | **IMPLEMENTED_AND_TESTED (smoke)**, India-only; validation weak (CY-4); forecast features unsafe (CY-3) | — | Methodology reference; needs Pakistani data and proper hold-out validation. |
| F14 Profitability, history, credit-readiness | AgroTrust AT-4 (event-trail pattern) | IMPLEMENTED_UNTESTED (pattern) | AgroTrust AT-3 (gamified score); Farmiq FQ-5 (synthetic-data model) | **NOT_FOUND** as a credible model. Ledger pattern reusable. |

## Every fabricated-output path found

These must **never** be ported, and they define the anti-patterns our tests must guard against.

| # | Repo | Location | What it fabricates | Trigger | Shown to user as real? |
|---|---|---|---|---|---|
| M1 | botanix | `services/PlantDiseaseService.ts:164-278` | Disease class and confidence from `Math.random()`, URI substring and clock | **Always** (the only path) | Yes, presented as an AI diagnosis |
| M2 | botanix | `assets/models/pllama/pllama_mobile.tflite` | A "model" that is 26 MB of zeros | n/a | Advertised as an on-device LLM |
| M3 | botanix | `assets/models/mobilenet/mobilenet_v2_plant_disease.tflite` | Invalid TFLite file | n/a | Advertised as the bundled model |
| M4 | kissan-alert | `lib/satellite/market.ts:201-259` | Mandi prices = base ± `Math.random()*200`, `arrivalDate: new Date()` | No data.gov.in key, or fetch failure (eNAM parser always returns `[]`) | Yes, dated "today" |
| M5 | kissan-alert | `lib/satellite/market.ts:262-300` | Price trend as a random walk | **Always** | Yes |
| M6 | kissan-alert | `islands/NDVIChart.tsx:49-78, 110-130` | 30 days of NDVI and rainfall history, plus "predictions" | No observations | Labelled "estimated" in code comments; label visibility in the UI not verified |
| M7 | kissan-alert | `ai/sarvam.ts:124-133, 213-219` | `[lang] text` translation; non-existent `mock_` audio URL | No key **or** `IS_DEV` | Yes |
| M8 | kissan-alert | `lib/maps/ola.ts:380-427` | Nearby agri-supply places | Always ("mock data for demo purposes") | Yes |
| M9 | kissan-alert | `db/seed.ts:172-180, 309` | NDVI and prices | Seed script | Seed only; dangerous if run in prod |
| M10 | kissan-alert | `docker-compose.yml` | `MOCK_SATELLITE_DATA=true` default | Default local config | — |
| M11 | AgroTrust | `apps/api/src/routes/auth.ts:63-68` | Login success for OTP `123456` | **Always** | Security bypass |
| M12 | AgroTrust | `apps/api/src/routes/payments.ts:195-232` | "Transaction initiated. You will receive a prompt on your phone." | **Always** (no provider call) | Yes; a false financial message |
| M13 | AgroTrust | `routes/achievements.ts:868` | "Credit score" increments from badges and referrals | Always | Yes, labelled a credit score |
| M14 | AgroTrust | `routes/seed.ts` via public `/seed/demo` | Demo farmers, listings, prices with random dates | Any unauthenticated caller | Yes, once written |
| M15 | Farmiq | `.venv/Include/ai-models/data_generator.py` → `train_credit_model.py` | Credit model trained on 1,000 synthetic farmers | Always | Yes, as a creditworthiness prediction |
| M16 | Crop-Yield | `src/components/forecast_data.py` (via `scripts/test_forecast.py`) | Whole-season weather features from ~10% forecast coverage | Forecast mode | Real data, but misleadingly extrapolated (a warning string is emitted) |

## Real implementations worth carrying forward

| Capability | Source | Evidence level | Conditions |
|---|---|---|---|
| Tenant-scoped FastAPI with org roles, PostGIS fields, share links, audit events | OpenFarm OF-1/3/12/13 | STATIC (Phase B will RUN) | Add tests first; add phone identity. |
| Sentinel-2 STAC → per-field COG → TiTiler tiles, with scene provenance | OpenFarm OF-5 | STATIC | Fix reflectance scaling, BOA offset and SCL masking; golden-value tests. |
| FTW field-boundary detection | OpenFarm OF-4 | STATIC | CC-BY checkpoint only; document provisioning; pin hash. |
| Open-Meteo forecast and archive with retries | OpenFarm OF-7 | STATIC | Surface provider failure explicitly; run beat; commercial key. |
| FAO-56 dual-Kc water balance and auto-irrigation | pyfao56 PF-1/2/3 | **RUN, reproduced** | Pakistani crop parameters must be sourced and documented. |
| WaPOR ETLook water productivity | pywapor PW-1/2 | RUN (install/import); tests blocked | Provider credentials; isolated image. |
| XGBoost yield pipeline on real public data, with SHAP | Crop-Yield CY-1 | RUN (smoke) | India-only; temporal/spatial validation needed; license confirmation. |
| FCM v1 HTTP sender | kissan KA-6 | STATIC | Add delivery tracking; license confirmation. |
| Immutable credit/audit event trail | AgroTrust AT-4 | STATIC | Pattern only. |
| Genuine MobileNetV2 PlantVillage weights | botanix BX-3 → HF upstream | RUN (hash match) | License `other`, unclear; lab images; re-evaluate before any use. |

## Controls we will adopt as a result (inputs to Phase C/D)

1. **No silent fallback to synthetic values.** Every provider failure returns an explicit `unavailable` state with the provider name and error class. A CI check will grep for `Math.random`/`np.random` outside tests and seed scripts.
2. **Every observation row carries provenance** (`source`, `source_id`, `retrieved_at`, `processing_version`), and every demo fixture carries `is_demo=true`, which the UI must render visibly.
3. **Model artifacts must pass a load-and-infer test in CI**: valid flatbuffer, expected input/output tensor shapes, and parity with a reference output on fixed images. This would have caught M2 and M3 immediately.
4. **Financial actions return only provider-confirmed states.** "Pending" is shown as pending, and voice- or USSD-extracted transactions require explicit farmer confirmation before saving (project principle).
5. **No OTP bypass codes in any build.** OTPs come from a CSPRNG, are stored hashed, expire, and are attempt-limited, with tests asserting that `123456` is rejected.
