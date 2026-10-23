# Official DPP reference lists (derived CSVs)

These three CSVs hold the lists published by Pakistan's **Department of Plant Protection (DPP)**, Ministry of National
Food Security & Research. They are loaded by `npm run seed:pesticide` (and `seed:pesticide:prod`) into
`banned_pesticide_ingredients`, `banned_pesticide_products` and `dpp_notified_products` (migration `1755000048000`).
The raw PDF/XLS downloads are **not** stored in the repository.

| File | Rows | What it is |
| --- | --- | --- |
| `dpp-banned-ingredients.csv` | 26 | "List of Banned Pesticides (A)": chemical, position in Pakistan, S.R.O. number and date. Rows 3-21 inherit S.R.O 930(I)/1994 (written "-do-" in the source); row 25 inherits S.R.O 1089(I)/2005. Rows 1 (BHC) and 22 (Heptachlor) carry only the "deregistered" position text. |
| `dpp-banned-premixes.csv` | 9 | "List (B)": banned pre-mixture **brands** vide SRO 624(I)/96 dated 15 July 1996. The source spells one component "Qulinalphos" (probably Quinalphos); the normaliser folds both spellings. |
| `dpp-form16-notified.csv` | 139 | Form-16 notified products, S.R.O. 636(I)/2005 dated 22.06.2005: an **ingredient + concentration + formulation** list with category, uses and WHO class. |

## Sources

- https://plantprotection.gov.pk/services/pesticide-registration/list-of-registered-pesticides-in-pakistan/
- https://plantprotection.gov.pk/services/pesticide-registration/list-of-banned-pesticides-in-pakistan/
- https://plantprotection.gov.pk/wp-content/uploads/2021/07/LIST-OF-BANNED-PESTICIDES-26-PRODUCTS.pdf

Retrieved **2026-10-23** from the project owner's browser downloads
(`LIST-OF-BANNED-PESTICIDES-26-PRODUCTS.pdf`, `Notified-List-F-16-S.R.0-636I-2005-141-PRODUCTS.xls`).

## What these lists are, and are not

- The **banned lists are legal notifications** and are treated as authoritative: a hit is a forced HIGH_RISK result.
- The **Form-16 list has no brand names, no companies and no registration numbers.** It is a 2005 snapshot and is
  **partial**: the DPP has several hundred more registered products today. Therefore "not on our list" is shown as
  *could not confirm* and is never described as unregistered, fake or illegal.
- Dawai Check says a label is "consistent with the DPP notified list" - never "registered", "genuine" or "approved".
- 18 of the 139 Form-16 rows have an empty `who_class` in the source itself. 16 rows got category / uses / WHO class by
  joining sheet "139 Product (Notified)" to the workbook's second sheet ("With Classification"): 129 rows joined on
  exact normalised text, 9 by text similarity >= 0.85 and 1 by hand (`join_method` column: `exact`, `fuzzy`, `manual`;
  `classification_text` shows what was matched). Category and class are copied from the DPP sheet as published (it
  contains a few oddities, e.g. a herbicide filed under "Acari."), not corrected. Row 74's own note says MCPA was left
  out by a typing error; the product text is stored as written (Fluroxypyr only).
- **Usage terms of these government publications are unverified.** Confirm that redistribution inside the repository
  and use in the app is permitted before publishing the data outside the project.

## Refreshing the data

1. Download the new files from the DPP pages above.
2. Rebuild the notified CSV (needs `xlrd`; the "extracted" CSV is the plain export of sheet "139 Product (Notified)"):
   `python -I tools/build-form16-csv.py <dpp-form16.xls> <extracted.csv> dpp-form16-notified.csv`
3. Update the two banned CSVs by hand (they are small) and bump `DPP_RETRIEVED_ON` in `../../pesticide-seed.ts` and
   `DPP_RETRIEVED_ON` in `../../pesticide-risk.engine.ts`.
4. `npm run seed:pesticide` (idempotent: rows are upserted by serial / normalised name; demo banned rows that are not
   on the DPP list are removed).
5. `npx jest test/dpp-parser.spec.ts test/pesticide-dpp-engine.spec.ts` - the parser test fails if any notified row
   yields zero ingredients.
