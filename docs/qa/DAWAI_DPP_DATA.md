# Dawai Check: official DPP data (23 Oct 2026)

## What was imported

Source: Pakistan Department of Plant Protection (DPP), retrieved 2026-10-23 from the owner's browser downloads
(PDF and XLS kept outside the repository). Derived CSVs live in
`services/api/src/domain/pesticide-check/seed/dpp/` (the README there has URLs, coverage statements and refresh steps).

| Table | Rows | Origin |
| --- | --- | --- |
| `banned_pesticide_ingredients` (DPP rows, `is_demo=false`) | 26 | List of Banned Pesticides (A); S.R.O. 930(I)/1994, 204(I)/2001, 1089(I)/2005, 1329(I)/2012; BHC and Heptachlor carry position text only |
| `banned_pesticide_products` | 9 | List (B) pre-mixture brands, SRO 624(I)/96 dated 15 Jul 1996 |
| `dpp_notified_products` | 139 | Form-16, S.R.O. 636(I)/2005 dated 22.06.2005; 121 have a WHO class (18 are empty in the source) |
| `pesticide_products` | 20 | unchanged DEMO placeholders (plus the empty user-demo CSV) |

Removed: the 13 placeholder demo banned ingredients. The seed deletes demo banned rows that are not on the DPP list
(7 were deleted from the local dev DB: aldrin, chlordane, mirex, lindane, chlordecone, hexachlorobenzene,
pentachlorophenol; the 6 that are also on the DPP list were upgraded to official rows).
Migration `1755000048000-dpp-reference-data` is reversible (up/down tested). It also adds `list_coverage`,
`matched_notified` and `banned_match` to `pesticide_checks` so a saved result re-presents identically.

## Honest limits

- The Form-16 list has **no brand names, companies or registration numbers**, is from 2005 and is **partial**. A product
  missing from it is shown as "could not confirm", never as unregistered or fake. Brand-level matching only knows the DEMO
  products and the owner's user-demo CSV.
- The banned lists are legal notifications and are treated as authoritative.
- Usage terms of the DPP publications are **unverified**.
- Category and WHO class are copied from the DPP sheet as published (it has oddities, e.g. a herbicide filed under "Acari.").
- Ingredient comparison uses exact normalised names (variants folded: chlorpyrifos/chlorpyriphos, quinalphos/qulinalphos,
  propargyl/propergyl, aluminium/aluminum, sulphur/sulfur, several source typos) with a 0.85 trigram tolerance only for
  names of 8+ letters. A label naming only part of a notified mixture, or a combination that is not a notified row, is
  `unknown` (not pass). OCR that drops a "+" or an ingredient can therefore give "could not confirm".
- The premix brand threshold is strict: one stray character on a short brand (for example "Ammo-phoss") stays below 0.8 and is not flagged.

## Parser (`dpp-parser.ts`) and edge cases

`parseNotifiedProduct` returns ingredients, strengths and formulations. All 139 rows yield at least one ingredient and
one strength; 138 yield a formulation (row 97, methyl bromide, lists only per cent strengths). Handled: trailing dots,
`80WP`, `20G`, `262. 5`, `per cent`, `+` mixtures (also with bracketed per-ingredient strengths), `/` and comma variants,
decoding debris in dashes (`Fenoxaprop ? P ? ethyl`), formulation words (Tablets, plates, strips), editorial notes.
Ambiguous rows: **74** (its note says MCPA was left out by a typing error; stored as Fluroxypyr only), **47/48**
(Diazinon is notified twice with different formulations), **13, 18, 19, 40, 41, 44, 68, 73, 81** (strength given as a
total and per ingredient: all numbers are kept as strengths), **104** (paraquat dichloride strength in brackets),
**107** (powder/dust forms after the EC strength; only EC is parsed as a formulation), **124** (Sulphur, folded to sulfur).

## Proofreading sample (30 of 139 rows, source text vs parse)

| # | Original text (source) | Ingredients | Strengths | Formulations | Category | WHO |
|---|---|---|---|---|---|---|
| 1 | Abamectin 1.8% EC. | Abamectin | 1.8% | EC | Ins. | III |
| 2 | Acephate 40 EC, 75 SP. | Acephate | 40; 75 | EC, SP | Ins. | III |
| 3 | Acetamiprid 20% SL, 20% SP | Acetamiprid | 20% | SL, SP | Ins. | II |
| 7 | Aluminium Phosphide 56% (ALP) Tablets, Pellets, Bags. | Aluminium Phosphide | 56% | Tablets, Pellets, Bags | Fumigant | I |
| 8 | Ametryn + Atrazine 80WP, 50 FW. | Ametryn + Atrazine | 80; 50 | WP, FW | Herb. | III + III |
| 13 | Beta Cyfluthrin + Chlorpyrifos 262. 5 EC (12.5 g/l + 250 g/l). | Beta Cyfluthrin + Chlorpyrifos | 262.5; 12.5 g/l; 250 g/l | EC | Ins. | II + II |
| 17 | Bromoxynil + MCPA 200/200 EC, 200/328 EC. | Bromoxynil + MCPA | 200/200; 200/328 | EC | Herb. | II + III |
| 18 | Bromoxynil acid + Mencaprop 390 SL (90 + 300 g/lit.). | Bromoxynil acid + Mencaprop | 390; 90; 300 g/lit. | SL | Herb. | II + III |
| 19 | Buprofezin + Fenpropathrin 250 EC (17.5% + 7.5%). | Buprofezin + Fenpropathrin | 250; 17.5%; 7.5% | EC | Ins. | III +II |
| 23 | Carbaryl  20G, 85 SP, 10 D. | Carbaryl | 20; 85; 10 | G, SP, D | Ins. | II |
| 29 | Chlorfenvinphos 10 G, 24 EC. | Chlorfenvinphos | 10; 24 | G, EC | Ins. | Ib, I |
| 33 | Chlortoluron + MCPA 60% WP (40% + 20%). | Chlortoluron + MCPA | 60%; 40%; 20% | WP | Herb. | - |
| 34 | Clodinafop propergyl 15% WP. | Clodinafop propergyl | 15% | WP | Acari. | III |
| 39 | Cymoxanil + Mancozeb 72% WP (8% + 64%) | Cymoxanil + Mancozeb | 72%; 8%; 64% | WP | Fung. | III + IV |
| 44 | Deltamethrin + Triazophos 360 EC (10 + 350 g/l). | Deltamethrin + Triazophos | 360; 10; 350 g/l | EC | Ins. | II + Ib |
| 47 | Diazinon 5% G, 10% G | Diazinon | 5%; 10% | G | Ins. | - |
| 48 | Diazinon 80/90 ULV, 60 EC. | Diazinon | 80/90; 60 | ULV, EC | Ins. | II |
| 52 | Diclofop – methyl 28% EC. | Diclofop-methyl | 28% | EC | Herb. | III |
| 60 | Emamectin Benzoate 1.9% EC, 5 WDG. | Emamectin Benzoate | 1.9%; 5 | EC, WDG | Ins. | II |
| 65 | Fenoxaprop – P – ethyl + Diclofop Methyl 7.5% EC (6.9% + 0.6%). | Fenoxaprop-P-ethyl + Diclofop Methyl | 7.5%; 6.9%; 0.6% | EC | Herb. | - |
| 74 | Fluroxypyr 30% WP (5% + 25%) (Typing error not included MCPA) | Fluroxypyr | 30%; 5%; 25% | WP | Herb. | III + III |
| 78 | Glyphosate 41% SL / 48% SL. | Glyphosate | 41%; 48% | SL | Herb. | III |
| 82 | Imidacloprid 25 EC, 25 WP, 70 WS, 200 SL. | Imidacloprid | 25; 70; 200 | EC, WP, WS, SL | Ins. | II |
| 89 | Magnesium Phosphide 56 per cent plates; strips. | Magnesium Phosphide | 56% | Plates, Strips | Fumigant | I |
| 97 | Methyl Bromide 98per cent, 100 per cent. | Methyl Bromide | 98%; 100% | - | Fumigant | II |
| 104 | Paraquat 20% SL (P. dichloride 25.4%) | Paraquat | 20%; 25.4% | SL | Herb. | II |
| 107 | Permethrin 25 EC. 0.5 per cent Powder; 0.5 per cent dust.” | Permethrin | 25; 0.5% | EC, Powder, Dust | Ins. | II |
| 116 | Propergite 57 EC. | Propergite | 57 | EC | Acari. | III |
| 124 | Sulphur 80% WG, 80% WP | Sulphur | 80% | WG, WP | Fung. | IV |
| 139 | Zeta-cypermethrin 18.1 EC. | Zeta-cypermethrin | 18.1 | EC | Ins. | Ib |

## Live end-to-end (web BFF, API, Tesseract), generated label photos, local stack

| Variant | Read (brand / ingredient) | Verdict | Score | Coverage | demoDataset | Key checks | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dpp-notified | Agrimectin 1.8 EC / Abamectin | VERIFIED | 0 | DPP_PARTIAL | no | ingredient_notified:pass, banned_ingredient:pass, banned_premix_brand:pass, expiry_date:pass | PASS |
| premix-banned | Ammo-phos 450 EC / Cypermethrin | HIGH_RISK | 100 | DPP_PARTIAL | no | ingredient_notified:unknown, banned_ingredient:fail, banned_premix_brand:fail, expiry_date:pass | PASS |
| endosulfan | Superkill 35 EC / Endosulfan | HIGH_RISK | 100 | DPP_PARTIAL | no | ingredient_notified:unknown, banned_ingredient:fail, banned_premix_brand:pass, expiry_date:pass | PASS |
| not-on-list | GreenMax Super Spray / Zorbitol | SUSPICIOUS | 25 | DPP_PARTIAL | no | ingredient_notified:unknown, banned_ingredient:pass, banned_premix_brand:pass, expiry_date:pass | PASS |
| expired | Agrimectin 1.8 EC / Abamectin | SUSPICIOUS | 45 | DPP_PARTIAL | no | ingredient_notified:pass, banned_ingredient:pass, banned_premix_brand:pass, expiry_date:fail | PASS |
| demo-product | DEMO Imidacloprid 20% SL / Imidacloprid | VERIFIED | 0 | DPP_PARTIAL | yes | ingredient_notified:pass, banned_ingredient:pass, banned_premix_brand:pass, expiry_date:pass | PASS |

Screenshots (360x740 and 1440x900, English and Urdu) of the DPP-notified, premix-banned and not-found results are in
`docs/qa/dawai-dpp/` (`dpp-m360-*`, `dpp-d1440-*`); `dpp-e2e.cjs` reproduces everything (one login, six uploads).
All twelve screenshot checks passed: expected verdict wording, no horizontal scroll, no DEMO badge, none of
genuine/authentic/approved/safe.

## Commands and results

- `npx jest test/dpp-parser.spec.ts test/pesticide-dpp-engine.spec.ts test/pesticide-risk.engine.spec.ts test/pesticide-label-fields.spec.ts --forceExit`: pass.
- Integration on a disposable PostGIS container (`qa14-pg`, port 55454, all migrations, real CSVs seeded):
  `QA10_TEST_DATABASE_URL=postgres://postgres:<pw>@127.0.0.1:55454/qa10_test npx jest --runInBand --testRegex='pesticide-check\.integration-spec\.ts$' --forceExit`: 20/20 pass (migration up/down, seed idempotency, provenance, Abamectin pass with WHO class, Ammo-phos premix HIGH_RISK, Endosulfan S.R.O. 1329(I)/2012, unknown-not-warn, expired fail, ownership isolation).
- Web: `node --test tests/dawai-check/*.test.cjs` (35 pass), `npx tsc --noEmit`, `npx eslint components/dawai-check features/dawai-check`: clean.
- Local stack: `npx nest build`, `stack-demo.sh` (applied 1755000048000), `npm run seed:pesticide` (26 banned, 9 premix, 139 notified, 7 demo banned removed), web rebuilt and restarted on 3100.
