# Dawai Check (pesticide label risk screening)

A farmer photographs a pesticide label (or types the details) and gets a **risk screening**: product found in a
reference list, ingredient consistency, banned-ingredient hit, registration number, expiry, company, price sanity.
It is **not a laboratory test** and never says a product is "genuine"; with demo data the UI must say
"consistent with the DEMO list" and with the DPP lists "consistent with the DPP notified list". The API returns `demoDataset` and bilingual `disclaimer` for that purpose.

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

Response: `{id, createdAt, inputMode, language, verdict, score, demoDataset, listCoverage, dataSources[], matchedNotified, bannedMatch, extracted, matchedProduct, checks[], explanation, disclaimer{en,ur}, provider, model, latencyMs}`.
Additive DPP fields: `listCoverage` is `DEMO` or `DPP_PARTIAL`; `dataSources` is `[{name, asOf, url}]` (empty for DEMO); `matchedNotified` is `{productText, category, whoClass, notification}` or null; `bannedMatch` is `{kind: ingredient|premix, name, notificationNumber, notificationDate, position?}` or null. `demoDataset` is true only if a demo row influenced the result.
`verdict` is `VERIFIED | SUSPICIOUS | HIGH_RISK | UNREADABLE`. `score` is a **risk score 0-100 (higher = riskier)**; a banned ingredient forces `HIGH_RISK` / 100. Each check is `{code,status(pass|warn|fail|unknown),titleEn,titleUr,detailEn,detailUr}`.

## How it works

1. Image fetched via a signed media URL, EXIF-rotated, greyscaled, contrast-normalised, upscaled to >= 1200 px.
2. Tesseract (bundled `assets/tessdata/eng.traineddata`, nothing downloaded at runtime, one worker, one job at a time, 25 s timeout; low-confidence photos are retried rotated 180/90/270 degrees).
3. `extractLabelFields` (regex heuristics) -> fields; fuzzy brand match with `pg_trgm` on normalised names; banned-list scan.
4. `pesticide-risk.engine.ts` (pure, thresholds at the top of the file) -> verdict, score, checks. Explanation text is template-based, no LLM.
5. Result stored in `pesticide_checks`; the model call is also logged in `ai_runs` as `LABEL_READING`.

## Data

**Official DPP lists** (`seed/dpp/`, see its README; retrieved 2026-10-23): 26 banned ingredients (S.R.O. numbers/dates), 9 banned pre-mixture brands (SRO 624(I)/96) and 139 Form-16 notified products (S.R.O. 636(I)/2005). The Form-16 list is an ingredient + strength + formulation list from 2005 with no brands, companies or registration numbers, and it is partial. Plus 20 placeholder demo products (`DEMO ...`) and an empty `pesticide-products.user-demo.csv` for the owner's exact bottles. Usage terms of the DPP publications are unverified. `npm run seed:pesticide` is idempotent and deletes placeholder demo banned rows that are not on the DPP list.

### Checks added with the DPP lists (only when the DPP tables are loaded)

- `banned_ingredient`: DPP list A. Fail forces HIGH_RISK (100); the detail names the S.R.O. number and date (or the position text for BHC/Heptachlor).
- `banned_premix_brand`: normalised brand equality or pg_trgm-compatible similarity >= 0.8 (also with the strength/formulation suffix removed, or a long brand name found in the label text). Fail forces HIGH_RISK.
- `ingredient_notified`: pass when a Form-16 row has exactly the label's ingredients (strength/formulation match is reported, category and WHO class included); `unknown` (never warn/fail) otherwise, with "not found on the partial 2005 DPP list; this does not mean it is unregistered".
- `product_registered` (brand level) keeps working for demo / user-demo rows; with DPP data and no brand match it is `unknown` ("brand names are not part of the DPP lists we hold") and adds no risk points.

### Verdict policy with the DPP lists (constants in `pesticide-risk.engine.ts`)

Banned ingredient or banned pre-mixture -> HIGH_RISK/100. Otherwise score >= 60 HIGH_RISK; score >= 25 or any failed check (e.g. expired) SUSPICIOUS; a notified-list pass (or a matched demo/user product) with nothing failed -> VERIFIED (UI: "Consistent with the DPP notified list"); nothing confirmed and nothing wrong -> SUSPICIOUS at the floor score `UNCONFIRMED_SCORE` (25), worded "Could not confirm on the list we hold ... does not mean the product is fake" with a neutral tone (the verdict enum is constrained in the database). Missing registration number (+10) and missing expiry (+15) still add risk as before.

## Enable locally

```
npm run migration:run          # applies 1755000047000 (pg_trgm, tables, media purpose, ai_runs operation) and 1755000048000 (DPP lists)
npm run seed:pesticide
# .env: DAWAI_CHECK_ENABLED=true  (LABEL_READER_PROVIDER=tesseract is the default)
```

## Known limits

English labels only unless `urd.traineddata` is added; heavily curved/glossy packs and very small print read worse than flat synthetic labels; the first OCR after boot loads the worker (a few seconds); photo quality drives results, so UNREADABLE shows a retake tip.
