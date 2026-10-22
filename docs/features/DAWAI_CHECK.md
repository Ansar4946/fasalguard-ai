# Dawai Check (pesticide label risk screening)

A farmer photographs a pesticide label (or types the details) and gets a **risk screening**: product found in a
reference list, ingredient consistency, banned-ingredient hit, registration number, expiry, company, price sanity.
It is **not a laboratory test** and never says a product is "genuine"; with demo data the UI must say
"consistent with the DEMO list". The API returns `demoDataset` and bilingual `disclaimer` for that purpose.

## Switches

| Variable | Default | Meaning |
| --- | --- | --- |
| `DAWAI_CHECK_ENABLED` | `false` | API: routes exist only when `true` (otherwise 404, app boots as before). |
| `NEXT_PUBLIC_DAWAI_CHECK_ENABLED` | unset | Web build-time flag for the UI entry. |
| `LABEL_READER_PROVIDER` | `tesseract` | `tesseract` (local, free), `openai-compatible` (hosted vision, falls back to tesseract), `fake` (tests). |
| `LABEL_OCR_LANGS` | `eng` | `eng+urd` only if `assets/tessdata/urd.traineddata` is present. |
| `LABEL_VISION_BASE_URL/KEY/MODEL` | empty | Only for `openai-compatible`; all three required in production. |

## Endpoints (`/api/v1`, farmer role)

- `POST /pesticide-checks` `{mediaAssetId, language?, priceRs?, packSize?}` - media must be the caller's, purpose `pesticide-label`, status `ready` (upload with the normal presign/complete flow).
- `POST /pesticide-checks/manual` `{brandName, activeIngredient?, registrationNo?, expiryDate?, priceRs?, packSize?, language?}`
- `GET /pesticide-checks` (latest 20, own) and `GET /pesticide-checks/:id` (own, else 404)
- `GET /pesticide-products?search=` autocomplete, max 10

Response: `{id, createdAt, inputMode, language, verdict, score, demoDataset, extracted, matchedProduct, checks[], explanation, disclaimer{en,ur}, provider, model, latencyMs}`.
`verdict` is `VERIFIED | SUSPICIOUS | HIGH_RISK | UNREADABLE`. `score` is a **risk score 0-100 (higher = riskier)**; a banned ingredient forces `HIGH_RISK` / 100. Each check is `{code,status(pass|warn|fail|unknown),titleEn,titleUr,detailEn,detailUr}`.

## How it works

1. Image fetched via a signed media URL, EXIF-rotated, greyscaled, contrast-normalised, upscaled to >= 1200 px.
2. Tesseract (bundled `assets/tessdata/eng.traineddata`, nothing downloaded at runtime, one worker, one job at a time, 25 s timeout; low-confidence photos are retried rotated 180/90/270 degrees).
3. `extractLabelFields` (regex heuristics) -> fields; fuzzy brand match with `pg_trgm` on normalised names; banned-list scan.
4. `pesticide-risk.engine.ts` (pure, thresholds at the top of the file) -> verdict, score, checks. Explanation text is template-based, no LLM.
5. Result stored in `pesticide_checks`; the model call is also logged in `ai_runs` as `LABEL_READING`.

## Data

Reference lists are **demo data** (`src/domain/pesticide-check/seed/`, see its README): 20 ingredient-based placeholder products, 13 internationally listed banned ingredients, and an empty `pesticide-products.user-demo.csv` for the owner's exact demo products. `npm run seed:pesticide` is idempotent. Replace with official DPP lists before any real-world claim.

## Enable locally

```
npm run migration:run          # applies 1755000047000 (pg_trgm, tables, media purpose, ai_runs operation)
npm run seed:pesticide
# .env: DAWAI_CHECK_ENABLED=true  (LABEL_READER_PROVIDER=tesseract is the default)
```

## Known limits

English labels only unless `urd.traineddata` is added; heavily curved/glossy packs and very small print read worse than flat synthetic labels; the first OCR after boot loads the worker (a few seconds); photo quality drives results, so UNREADABLE shows a retake tip.
