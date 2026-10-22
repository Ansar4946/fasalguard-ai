> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Satellite Numerical Validation — OpenFarm (Phase B)

| | |
|---|---|
| Date | 2026-10-13 |
| Code under test | OpenFarm `884a6156` — `services/api/app/tasks/pipeline.py`, `tasks/indices.py` (imported and executed unmodified) |
| Data | Element84 Earth Search v1, collections `sentinel-2-l2a` (what OpenFarm uses) and `sentinel-2-c1-l2a` (comparison), MGRS tile 43RCQ |
| Test field | 6.04 ha rectangle, rural Faisalabad district, Punjab (73.0300–73.0326 E, 31.3300–31.3322 N) |
| Cloud-case field | 6 ha box centred 72.7996 E, 31.1639 N (chosen because a selected scene was cloudy over it, see §5) |
| Scripts | `phaseb/harness/satellite_validate.py`, `phaseb/harness/satellite_cloud_case.py` |
| Raw output | `logs/satellite/validation_results.jsonl`, `logs/satellite/cloud_case.jsonl`, `logs/satellite/stac_*.json` |

**Correction to Phase A.** `REPOSITORY_AUDIT.md` OF-5 said OpenFarm's NDVI and NDWI "carry a bias" because the BOA offset is never removed. **For the collection OpenFarm actually uses, that is wrong.** Element84 has already removed the offset from `sentinel-2-l2a` (shown below), so NDVI and NDWI as deployed are numerically correct. The EVI/SAVI finding and the cloud-mask finding stand, and both are now confirmed on real data.

## 1. Results summary

| # | Question | Result | Class |
|---|---|---|---|
| S1 | What product, baseline and units does OpenFarm read? | `sentinel-2-l2a`; all 86 items over the field this season are processing baseline 05.11–05.13; uint16 DN, nodata = 0 | RUN_PASS (facts recorded) |
| S2 | Is the −1000 BOA offset already removed in `sentinel-2-l2a`? | **Yes.** Same scene, same 572 pixels, all 4 bands: `l2a DN = c1 DN − 1000` exactly (mean and median diff −1000.0). ESA `MTD_MSIL2A.xml`: `BOA_ADD_OFFSET = −1000` (all bands), `BOA_QUANTIFICATION_VALUE = 10000`. All 86 l2a items carry `earthsearch:boa_offset_applied: true`. | RUN_PASS |
| S3 | Is the STAC `raster:bands` metadata on `sentinel-2-l2a` trustworthy? | **No.** It advertises `scale 0.0001, offset −0.1` even though the offset was already applied. A consumer applying it would subtract the offset twice. | RUN_FAIL (upstream metadata) |
| S4 | NDVI as deployed | Correct: mean 0.6325, zero pixel error vs the reference on reflectance (2026-10-06) | RUN_PASS |
| S5 | NDWI (McFeeters) as deployed | Correct: mean −0.5906, zero pixel error | RUN_PASS |
| S6 | EVI as deployed | **Wrong**: 0.9255 vs reference 0.4415; mean abs pixel error 0.484, max 0.682 | RUN_FAIL |
| S7 | SAVI as deployed | **Wrong**: 0.9486 vs reference 0.4252; mean abs pixel error 0.524 | RUN_FAIL |
| S8 | Nodata handling | Pixels with all bands = 0 give EVI = 0.0 and SAVI = 0.0 (finite), so they are **counted as valid**. Red = 0 only gives NDVI = 1.0. | RUN_FAIL |
| S9 | Per-pixel cloud/shadow masking (SCL) | **Absent.** Only scene-level `eo:cloud_cover < 20`. | STATIC_VERIFIED |
| S10 | Do clouds cause false NDVI alerts in OpenFarm's own scene selection? | **Yes, on real data.** Field 2, 2026-09-18: scene cloud 8.16% (passes filter), **100% of field cloud/shadow**, NDVI −0.013 gives an `ndvi_drop` of **106%** plus `ndvi_threshold`. 2026-04-09: 72% obscured, a false 72.8% drop. These 4 alerts vanish with an SCL mask. Field 1: 0 of 36 selected scenes were cloudy over the field, so no cloud-induced alerts there. | RUN_FAIL |
| S11 | Acquisition dates and scene selection | Weekly lowest-scene-cloud selection; 36 scenes over 2025-11-01 → 2026-10-12 (field 1), 40 (field 2). Dates stored per layer; provenance stores scene id and band hrefs. | RUN_PASS |
| S12 | Phenology-blind drop rule | Field 1: three `ndvi_drop` alerts (2026-03-05, 04-04, 04-09; 21–32%) coincide with the Rabi wheat harvest window. Field 2: the 0.3 threshold fired on ~25 of 40 scenes. | RUN_FAIL (agronomic) |
| S13 | `quality_score` | Constant 0.2961 for every scene: it equals field pixels ÷ bounding-grid pixels, not data quality | RUN_FAIL |
| S14 | Collection-switch hazard | Running OpenFarm's formulas on `sentinel-2-c1-l2a` (offset not removed) would silently change NDVI 0.6325 → 0.4236 and NDWI −0.5906 → −0.3997 | RUN_PASS (hazard quantified) |
| S15 | End-to-end: API job → Celery → COG → stats → TiTiler tile | Works. NDVI job 35 s, EVI job 72 s; stored NDVI for 2026-10-06 = 0.6325, matching §3 | RUN_PASS |

## 2. Product facts (S1–S3)

Query: Earth Search `POST /v1/search`, point (73.0313, 31.3311), 2025-11-01 → 2026-10-12.

| Property | `sentinel-2-l2a` (OpenFarm) | `sentinel-2-c1-l2a` |
|---|---|---|
| Items matched | 86 | 85 |
| Processing baselines | 05.11 (23), 05.12 (56), 05.13 (7) | 05.11 (23), 05.12 (56), 05.13 (6) |
| `earthsearch:boa_offset_applied` | `true` on all 86 | absent |
| `raster:bands` (B04) | `nodata 0, uint16, scale 0.0001, offset −0.1` | identical |
| Asset keys used by OpenFarm | `red`, `nir`, `green`, `blue` (via `stac_asset_map`), resolved to B04, B08, B03, B02 COGs | — |

Same-scene comparison, 2026-10-06 06:00:26Z (`S2C_43RCQ_20261006_0_L2A` vs `S2C_T43RCQ_20261006T055828_L2A`), scene cloud 0.0003%, field SCL = 485 px vegetation (4) + 87 px not-vegetated (5):

| Band | l2a mean DN | c1 mean DN | l2a − c1 (mean / median) | n |
|---|---|---|---|---|
| B02 | 425.6 | 1425.6 | −1000.0 / −1000.0 | 572 |
| B03 | 852.9 | 1852.9 | −1000.0 / −1000.0 | 572 |
| B04 | 761.6 | 1761.6 | −1000.0 / −1000.0 | 572 |
| B08 | 3338.0 | 4338.0 | −1000.0 / −1000.0 | 572 |

The authoritative ESA product metadata (`product_metadata.xml` = `MTD_MSIL2A.xml`, fetched from the c1 item; the l2a item's `s3://sentinel-s2-l2a/…` copy returned 404 anonymously) states `BOA_QUANTIFICATION_VALUE = 10000` and `BOA_ADD_OFFSET = −1000` for band_id 0–12. ESA's L2A conversion is ρ = (DN + BOA_ADD_OFFSET) / BOA_QUANTIFICATION_VALUE.

**Conclusion:**
- For `sentinel-2-c1-l2a`: ρ = DN/10000 − 0.1.
- For `sentinel-2-l2a`: ρ = DN/10000. The offset has already been removed, so the `offset: −0.1` in its `raster:bands` must **not** be applied.
- Code must not trust `raster:bands` blindly; it should branch on `earthsearch:boa_offset_applied` and the processing baseline, with a regression test.

*Not fetched in this session:* Element84's prose documentation on `boa_offset_applied` (their article URL returned HTTP 403). The conclusion rests on ESA's metadata plus the measured 1000-DN difference, not on that article.

## 3. Index validation (S4–S7, S14)

Reference formulas on surface reflectance ρ: NDVI = (NIR−R)/(NIR+R); NDWI = (G−NIR)/(G+NIR) (McFeeters 1996); EVI = 2.5·(NIR−R)/(NIR + 6R − 7.5B + 1) (Huete et al. 2002); SAVI = 1.5·(NIR−R)/(NIR+R+0.5) (Huete 1988).

### 3a. Synthetic fixtures (exact arithmetic)

"Harmonized DN" = ρ·10⁴, which is what `sentinel-2-l2a` delivers. "Offset DN" = ρ·10⁴ + 1000, which is what `c1` delivers. All values are OpenFarm's own formula functions.

| Case (ρ B02/B03/B04/B08) | Index | Reference | OpenFarm on harmonized DN | OpenFarm on offset DN |
|---|---|---|---|---|
| Dense crop .03/.06/.04/.45 | NDVI | 0.8367 | **0.8367** | 0.5942 |
| | NDWI | −0.7647 | **−0.7647** | −0.5493 |
| | EVI | 0.6997 | 1.0000 (clipped) | 1.0000 |
| | SAVI | 0.6212 | 1.2550 | 0.8912 |
| Moderate crop .05/.08/.08/.30 | NDVI | 0.5789 | **0.5789** | 0.3793 |
| | EVI | 0.3915 | 1.0000 (clipped) | 1.0000 |
| | SAVI | 0.3750 | 0.8683 | 0.5689 |
| Sparse crop .08/.11/.14/.22 | NDVI | 0.2222 | **0.2222** | 0.1429 |
| | EVI | 0.1370 | 0.4347 | 0.4877 |
| Bare soil .12/.16/.20/.26 | NDVI | 0.1304 | **0.1304** | 0.0909 |
| | EVI | 0.0962 | 0.2678 | 0.2941 |
| Water .06/.05/.03/.02 | NDVI | −0.2000 | **−0.2000** | −0.0400 |
| | NDWI | 0.4286 | **0.4286** | 0.1111 |
| | EVI | −0.0333 | 0.1000 | 0.0834 |

Interpretation, confirming your point: a pure multiplicative scale cancels in the homogeneous ratios NDVI and NDWI, so OpenFarm is exact on harmonized DN. An **additive** offset does not cancel; on offset DN, dense-crop NDVI falls from 0.84 to 0.59. EVI and SAVI are not homogeneous ratios: their constants (`+1`, `6`, `7.5`, `L = 0.5`) assume ρ ∈ [0, 1], so they are wrong on any DN input. Given correct reflectance, OpenFarm's formulas reproduce the reference exactly (column omitted, all equal).

### 3b. Real scene 2026-10-06, 572 field pixels

| Index | OpenFarm as deployed (l2a raw DN) | Reference (l2a ρ = DN/1e4) | Reference (c1 ρ = DN/1e4 − 0.1) | OpenFarm formula on c1 raw DN | Mean abs pixel error (deployed) |
|---|---|---|---|---|---|
| NDVI | 0.6325 | 0.6325 | 0.6325 | 0.4236 | 0.0000 |
| NDWI | −0.5906 | −0.5906 | −0.5906 | −0.3997 | 0.0000 |
| EVI | **0.9255** | 0.4415 | 0.4415 | 0.9324 | **0.4839** (max 0.6821) |
| SAVI | **0.9486** | 0.4252 | 0.4252 | 0.6353 | **0.5235** (max 0.6424) |

The two reference columns agree, which independently confirms the conversion rules in §2.

## 4. Nodata handling (S8)

`read_band_windowed` reads with `boundless=True, fill_value=0`; Earth Search nodata is also 0.

| Input (DN) | NDVI | NDWI | EVI | SAVI |
|---|---|---|---|---|
| All bands 0 | NaN (excluded) | NaN (excluded) | **0.0 (counted valid)** | **0.0 (counted valid)** |
| B02=500, B03=800, **B04=0**, B08=3000 | **1.0** | −0.5789 | −1.0 | 1.4998 |

At swath edges or nodata patches, EVI and SAVI field means get pulled toward 0, and a single-band dropout yields NDVI = 1.0. The code needs an explicit nodata mask (any band == 0) before computing indices.

## 5. Clouds, scene classification and false alerts (S9–S10)

OpenFarm selection (`search_scenes`): `eo:cloud_cover < 20` at **scene** level, then the lowest-cloud item per ISO week. No SCL read anywhere (`grep -n SCL` finds nothing in `tasks/`).

Method: for each selected scene, read SCL over the field with OpenFarm's own grid. "Bad" = SCL ∈ {0 nodata, 3 cloud shadow, 8 cloud medium, 9 cloud high, 10 thin cirrus, 11 snow}; "clear" = {4 vegetation, 5 not-vegetated}. The alert rules are replayed exactly as `pipeline.py run_alerts`: threshold < 0.3; drop ≥ 15% vs the mean of the last ≤ 4 means (needs ≥ 2). They're replayed (a) as deployed and (b) using the SCL-masked mean, skipping scenes with ≥ 50% bad pixels.

**Field 1 (Faisalabad test field)**: 36 selected scenes; **0 scenes with ≥ 10% bad pixels over the field**. Alerts are identical with and without masking (3 `ndvi_drop`). There's no cloud-induced error for this field this season, so the risk can't be demonstrated from field 1 alone.

**Field 2 (cloud case).** To test the mechanism, the hazier selected scenes (5–20% scene cloud) were scanned at reduced resolution over a 0.5° × 0.45° cropland AOI. Cloudy-over-cropland cells were found in all 5 (156–13,520 cells). A 6 ha field was placed under cloud from the 2026-04-04 scene, and OpenFarm's selection and alerts were rerun for it:

| Date | Scene cloud % | Field bad SCL % | NDVI deployed | NDVI masked | Deployed alerts | Masked alerts |
|---|---|---|---|---|---|---|
| 2026-03-05 | 0.93 | 0.0 | 0.7167 | 0.7167 | — | — |
| **2026-04-09** | 7.48 | **72.4** | **0.2063** | 0.3187 | `ndvi_drop` 72.8%, `ndvi_threshold` | (scene skipped: ≥ 50% bad) |
| 2026-04-14 | 0.0 | 0.0 | 0.2567 | 0.2567 | drop 58.6%, threshold | drop 66.1%, threshold |
| 2026-09-11 | 0.0 | 0.0 | 0.1797 | 0.1797 | drop 23.1%, threshold | same |
| **2026-09-18** | 8.16 | **100.0** | **−0.0125** | none | `ndvi_drop` **106.0%**, `ndvi_threshold` | none |
| 2026-09-26 | 0.03 | 0.0 | 0.1666 | 0.1666 | threshold | drop 20.1%, threshold |

**Alerts that exist only because of cloud: 2026-04-09 (drop, threshold) and 2026-09-18 (drop, threshold).** The 106% "drop" on 2026-09-18 would have been raised at high severity on a completely cloud-covered field. Masking also shifts later alerts, because the rolling baseline is no longer contaminated.

Unexplained: 2025-12-15 on field 2 shows NDVI 0.049 between 0.43 and 0.57, with 0% bad SCL and 1.57% scene cloud. It could be undetected haze or flood irrigation, but this audit does not diagnose it. It shows that SCL alone will not catch every artefact; a temporal outlier check is advisable.

## 6. Agronomic validity of the alert rules (S12–S13)

- **Phenology:** the drop rule compares against the last 4 scenes with no crop calendar. On field 1 it raised drops of 21%, 32% and 30% between 5 Mar and 9 Apr, which is the Punjab Rabi wheat maturity and harvest window. A farmer would be told to "consider scouting" during normal senescence.
- **Static threshold:** NDVI < 0.3 fired on about 25 of 40 scenes for field 2, a sparse or fallow field. That level of alert fatigue suggests thresholds need to depend on crop and growth stage.
- **`quality_score`** = valid pixels ÷ total grid pixels. Because the grid is the bounding box plus a buffer, it is constant (0.2961) whatever the cloud, so it can't be used to gate alerts.

## 7. What this means for F02 (inputs to Phase C, not implemented)

1. Convert to reflectance before all index math, branching on collection, `earthsearch:boa_offset_applied` and the processing baseline, with a golden-value test using the §3 fixtures. Fixes EVI and SAVI; protects NDVI and NDWI against a collection switch.
2. Mask nodata (any band == 0) and SCL classes {0, 1, 3, 8, 9, 10, 11} per pixel. Record the clear-pixel fraction **of the field** and suppress alerts below a minimum (e.g. 70%).
3. Store the processing baseline, the offset-applied flag and the SCL clear fraction in `provenance_json`.
4. Make drop and threshold rules crop- and stage-aware, or at least suppress them during declared harvest windows, and add a temporal-outlier guard.
5. Replace `quality_score` with the field-level clear fraction.
