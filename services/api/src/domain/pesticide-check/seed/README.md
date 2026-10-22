# Dawai Check seed data

These CSVs feed the **reference lists** used by Dawai Check (`pesticide_products`, `banned_pesticide_ingredients`).
They are **demo data**, not an official register. Everything seeded from here is marked `is_demo = true`
and the app says "consistent with the DEMO list", never "genuine".

| File | What it is |
| --- | --- |
| `pesticide-products.demo.csv` | 20 ingredient-based placeholder rows named `DEMO <ingredient> <conc> <form>`. No real brands, registration numbers or prices. |
| `banned-ingredients.demo.csv` | Internationally recognised persistent/banned ingredients (Stockholm / Rotterdam listings). Verify against the Pakistan DPP list before relying on it. |
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

## Replace everything with the official lists

1. Export the official DPP registered-product list and banned list to CSVs with the same headers.
2. Set `is_demo` to `false` on every row and put the official source (document name, date) in `source`.
3. Point the seed at them with `PESTICIDE_SEED_DIR=/path/to/dir` (files named `pesticide-products.official.csv`
   and `banned-ingredients.official.csv`) or replace the demo files, then run `npm run seed:pesticide`.
4. Remove the demo rows: `DELETE FROM pesticide_products WHERE is_demo; DELETE FROM banned_pesticide_ingredients WHERE is_demo;`

Rows are upserted by normalised brand name (lowercase, punctuation and spaces removed), so re-running updates in place.
