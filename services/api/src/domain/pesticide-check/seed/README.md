# Dawai Check seed data

These CSVs feed the **reference lists** used by Dawai Check. The **official DPP lists** (banned ingredients, banned
pre-mixture brands, Form-16 notified products) live in [`dpp/`](dpp/README.md) and are what "banned in Pakistan" claims
come from. The product CSVs below are **demo data** (`pesticide_products`), marked `is_demo = true`; a result that
matched one is flagged as a DEMO result and never called "genuine".

| File | What it is |
| --- | --- |
| `pesticide-products.demo.csv` | 20 ingredient-based placeholder rows named `DEMO <ingredient> <conc> <form>`. No real brands, registration numbers or prices. |
| `dpp/*.csv` | The official Pakistani DPP lists (26 banned ingredients, 9 banned pre-mixture brands, 139 Form-16 notified products). See `dpp/README.md`. The old placeholder `banned-ingredients.demo.csv` was removed; the seed also deletes demo banned rows that are not on the DPP list. |
| `pesticide-products.user-demo.csv` | **Empty (header only).** Add the 3-5 exact products you will show in the demo. |

## Add your demo products

Open `pesticide-products.user-demo.csv` and add one line per product. Columns:

```
brand_name,active_ingredient,concentration,formulation,company,registration_no,reference_price_rs,pack_size,crops,source,is_demo
```

Required: `brand_name`, `active_ingredient`. Everything else may be left empty.
Use the **exact name printed on the pack** you will photograph (spaces and punctuation do not matter, spelling does).
`crops` is a `;`-separated list. `source` defaults to "user demo entry"; `is_demo` defaults to `true`.
Example (fill with your own real values):

```
Your Brand 20 SL,Imidacloprid,20%,SL,Your Company Pvt Ltd,REG-123,950,250 ml,cotton;vegetables,owner demo entry,true
```

A registration number you enter is compared with the number OCR reads from the pack; a price is used for the
"unusually cheap" check. Only enter values you have verified yourself.

Then run (the seed is idempotent, safe to repeat):

```
npm run seed:pesticide
```

## Brand-level registered products

The DPP Form-16 list has no brand names, so the brand-level check only knows the demo products and the ones you add to
`pesticide-products.user-demo.csv`. If you obtain an official brand-level register, export it with the same headers,
set `is_demo` to `false`, put the document name and date in `source`, name it `pesticide-products.official.csv`
(or point `PESTICIDE_SEED_DIR` at a folder with it) and run `npm run seed:pesticide`. Remove the demo products with
`DELETE FROM pesticide_products WHERE is_demo;`.

Rows are upserted by normalised brand name (lowercase, punctuation and spaces removed), so re-running updates in place.
