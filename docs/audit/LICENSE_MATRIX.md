> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Fasal Guard — License Matrix (Phase A)

Audit date 2026-10-13. Commit SHAs are in [REPOSITORY_AUDIT.md](REPOSITORY_AUDIT.md#commit-shas-exact-versions-audited). This document records what the files say. It is **not legal advice**, and items marked ⚠ need a decision by the project owner or counsel before any reuse.

## Source code

| Repo | License file | License (as stated) | Commercial reuse | Obligations | Status for Fasal Guard |
|---|---|---|---|---|---|
| OpenFarm | `LICENSE` | **BSD-3-Clause**, © 2026 OpenFarm Contributors | Yes | Keep copyright notice and disclaimer; no endorsement using contributors' names. | ✅ Base. Keep `LICENSE` and add a `NOTICE`. |
| OpenFarm `.agents/skills/frontend-design/` | `LICENSE.txt` | Apache-2.0 | Yes | Notice and changes statement. | Dev tooling only; not shipped. |
| pyfao56 | `LICENSE.md` | **CC0 1.0** / US-Government public domain | Yes | None (attribution is courteous and recommended: Thorp et al.). | ✅ Reuse as a dependency. |
| fao-wetl-pywapor | `LICENSE` | **Apache-2.0** (`pyproject.toml` agrees) | Yes | Keep NOTICE/LICENSE; state changes; patent grant applies. | ✅ Adapt later. |
| botanix-mobile-ai | `LICENSE` | **MIT**, © 2025 Mertcan Gelbal | Yes | Keep notice. | Reference only (UI). |
| AgroTrust | `LICENSE` | **MIT**, © 2024 AgroTrust | Yes | Keep notice. | Reference only (patterns). |
| Farmiq | `LICENSE`, `farmiq-ussd/LICENSE` | **MIT**, © 2025 FARMIQ-T. `farmiq-ussd/package.json` says **ISC**. | Yes | Keep notice. | Reference only. Minor metadata conflict. |
| Kisan_Rabta | ⚠ **none at root** | README says "ISC". `dashboard/LICENSE.md` = MIT © 2023 TailAdmin. | ⚠ Unclear for project code | — | ⚠ Reference ideas only; **do not copy code** without written confirmation from the author. |
| kissan-alert-solution | ⚠ **none** | README says "MIT" | ⚠ Unclear | — | ⚠ Reference ideas only; **do not copy code** without written confirmation. |
| Crop-Yield-Prediction-System | ⚠ **none** (README links to a missing `LICENSE`) | README badge says "MIT" | ⚠ Unclear | — | ⚠ Reference only; get confirmation before copying code. |

A README statement without a LICENSE file is a weak grant. Our policy is to treat such repos as **"all rights reserved"** for code copying until the author confirms. Reading them for ideas and re-implementing independently is fine.

## Models and model assets

| Asset | Where | Upstream | License | Verified | Status |
|---|---|---|---|---|---|
| MobileNetV2 plant-disease classifier (`pytorch_model.bin`, 38 PlantVillage classes) | botanix `assets/models/mobilenet/` | HF `linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification` @ `c1861579` | ⚠ **`other`, no terms stated** on the model card | SHA-256 matches upstream byte-for-byte | ⚠ Do not redistribute in our app until clarified. Prefer training our own model on a dataset with a clear license. |
| `mobilenet_v2_plant_disease.tflite` | botanix | claimed conversion of the above | — | **Not a valid TFLite flatbuffer** | ❌ Unusable |
| `pllama_mobile.tflite` | botanix | none | — | **26 MB of zeros** after a 4-byte magic | ❌ Placeholder |
| `microsoft/DialoGPT-medium` (remote) | botanix `PLLaMaService.ts` | HF | MIT | API metadata | ❌ Not fit for purpose (chit-chat model) |
| FTW boundary model `prue_efnetb5_ccby_checkpoint.ckpt` | OpenFarm (expected in MinIO; not in repo) | GitHub `fieldsoftheworld/ftw-baselines` release v3.1 | **CC-BY checkpoint**: FTW states the CC-BY checkpoints are for commercial use. The "full" FTW checkpoints are non-commercial/academic only. Codebase is MIT. | Release asset exists | ✅ Use only the `*_ccby_*` checkpoint. Attribution required. Pin the SHA-256. |
| `openai/whisper-large-v3-turbo` | used by the Kisan_Rabta Space | HF | MIT | API metadata | ✅ Candidate for F08 STT, subject to our own Urdu/Punjabi WER evaluation. |
| `xomad/gliner-model-merge-large-v1.0` | Kisan_Rabta Space | HF | Apache-2.0 | API metadata | Possible entity extractor; evaluate later. |
| XGBoost yield model (`model.json`) and `preprocessor.pkl` | Crop-Yield `models/` | repo author | ⚠ inherits the missing repo license | Loads and predicts | ⚠ Reference only; India-only anyway. |
| Farmiq credit ensemble (`*.pkl`) | Farmiq `.venv/Include/ai-models/models/` | repo author | MIT (repo) | Trained on synthetic data | ❌ Reject; pickles are a code-execution risk. |

## Datasets

| Dataset | Where | Source and license (as known) | Status |
|---|---|---|---|
| India district crop production 1997-2015 (246,091 rows) | Crop-Yield `data/raw/india_crop_production_district.csv` | data.gov.in (Open Government Data Platform India, Government Open Data License – India) | Usable for methodology only. **Not Pakistani data.** |
| State NPK consumption, irrigation coverage (India) | Crop-Yield `data/raw/` | Provenance not documented in the files | ⚠ Unverified |
| PlantVillage / "New Plant Diseases Dataset" | upstream of the botanix model | The PlantVillage paper release (Hughes & Salathé) is commonly cited as CC BY. The Kaggle augmented derivative's terms vary. | ⚠ Verify the exact license and version before training F01/F06. Lab-condition images, not field photos. |
| Farmiq `farmer_profiles.csv` | Farmiq | Synthetic (`np.random`) | ❌ Not real data |
| kissan-alert `db/seed.ts` | kissan-alert | Random seed data | ❌ Not real data |

## External data and service providers referenced (terms to confirm before production)

| Provider | Used by | Terms note |
|---|---|---|
| Open-Meteo | OpenFarm, kissan-alert, AgroTrust | Free API is **non-commercial**; commercial use needs a subscription (OpenFarm already supports `open_meteo_api_key`). Data CC BY 4.0. |
| Element84 Earth Search (Sentinel-2 L2A COGs) | OpenFarm, kissan-alert | Copernicus Sentinel data: free and open with attribution ("Contains modified Copernicus Sentinel data [year]"). |
| ISRIC SoilGrids | OpenFarm | CC BY 4.0. |
| POLARIS soil | OpenFarm | US-only coverage, so it is irrelevant for Pakistan. |
| Copernicus CDS (ERA5), Copernicus Data Space, NASA Earthdata, VITO, LSASAF | pywapor | Free accounts; per-provider licences (generally open with attribution). |
| Resend (email) | OpenFarm | Commercial SaaS. |
| Africa's Talking (USSD/SMS) | Farmiq | Commercial. **Pakistan coverage must be confirmed**; local aggregators or operators may be required. |
| Google Gemini / Vertex AI, FCM | kissan-alert | Commercial (Google Cloud terms). |
| HuggingChat via `hugchat` | Kisan_Rabta | ❌ Unofficial client using account cookies; violates the spirit of the provider's terms. Not acceptable. |

## Attribution file to create when code is first imported (Phase E)

`THIRD_PARTY_NOTICES.md` must list at minimum: OpenFarm (BSD-3 full text), pyfao56 (CC0, citation), pywapor (Apache-2.0 + NOTICE) if adopted, the FTW CC-BY checkpoint (citation), Copernicus Sentinel attribution, SoilGrids attribution, and Open-Meteo attribution.
