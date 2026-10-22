# Satellite SAMPLE PREVIEW fallback

Date: 2026-10-16. Owner request: if satellite monitoring is not showing, show demo data - clearly labelled, never disguised as real.

## What changed

- `features/satellite/types.ts` (new): the real data shapes (moved out of the workspace component, unchanged).
- `features/satellite/display-source.ts` (new): `selectDisplaySource()`. Order: real in-progress scan (existing progress UI) > latest COMPLETED real capture (even if old; `stale` when older than 14 days) > SAMPLE with a reason (`CLOUD_BLOCKED`, `NO_VALID_SCENE`, `FAILED`, `NONE`, `LOAD_ERROR`). A COMPLETED capture always wins over sample, even if the user picked a failed scan in the Capture list.
- `features/satellite/sample-preview.ts` (new, the only place with sample numbers): `buildSamplePreview()` returns a `source: "SAMPLE"` object (statistics, 3 stress zones, valid-pixel/cloud values, 4-point trend). All values are synthetic and commented as such. Zones are small squares placed deterministically inside the field's own boundary (grid search, each candidate verified inside the outer ring, outside holes, with no edge touching). `RealSatelliteData` has `source: "REAL"`; `assertRealSatelliteData()` throws for sample and is the guard for any persist/export/alert/task/API path. No such path exists today; the page only reads.
- `components/intelligence/satellite-workspace.tsx`: uses the selection. In sample mode: persistent `role="status"` banner (black border, amber fill, warning glyph plus text) with the plain-words reason and a "Request a new real scan" button; "Sample - not real" corner badge and a diagonal SAMPLE watermark over the map (pointer-events none); every metric and chip labelled "(sample)" with a SAMPLE badge; Change detection shows "Sample point N" (no fake dates); AI interpretation and Recommended next steps replaced by "Not available for sample data" (actions are non-links, `aria-disabled`). A stale real capture shows an amber "Older real capture ... N days old" status notice. Real data rendering is otherwise unchanged. Small deliberate change: while captures load, "Loading satellite captures..." shows instead of the brief "No scans yet" text.
- Not touched: `services/*`, auth, `next.config.ts`, `proxy.ts`, BFF routes, dashboard. Sample values are never written to DB or storage and never returned by any API (they exist only in browser memory).

## Commands and results

- `node --test tests/satellite/sample-preview.test.cjs`: 11/11 pass (source order, no sample when COMPLETED exists for any picked scan, in-progress stays real, reason per FAILED/CLOUD_BLOCKED/NO_VALID_SCENE/none/load error, `source` guard throws, determinism, zones inside boundary for a rectangle and a concave L shape, rejection of outside/crossing polygons, degenerate boundary gives no zones, no storage APIs in sources).
- `npx tsc --noEmit` (NODE_OPTIONS=--max-old-space-size=3072): clean. `npx eslint features/satellite components/intelligence/satellite-workspace.tsx tests/satellite`: clean.
- Rebuilt with `STORAGE_UPLOAD_ORIGINS=http://localhost:4100 npm run build` (success) and restarted on port 3100 as specified (API, Docker, Postgres, Redis untouched; WEB_APP_URL unset).
- `node docs/qa/satellite-sample/verify.cjs` (Playwright Chromium, demo.farmer login once): 32/32 checks pass at 390x844 and 1440x900. Results in `docs/qa/satellite-sample/results.json`.

Screenshots (`docs/qa/satellite-sample/`):
- LIVE app, demo field "rangeel pur field": `sample-390-top.png`, `sample-390-full.png`, `sample-390-change.png`, `sample-1440-top.png`, `sample-1440-full.png`, `sample-1440-change.png`.
- MOCKED (page.route responses, not real data): `MOCKED-real-completed-fresh-1440.png` (3 days old, no sample label anywhere, real action links present) and `MOCKED-real-completed-stale-1440.png` (40 days old, shows the older-capture notice, still no sample label).

## Limits and unverified

- The demo field's newest scan is FAILED (not CLOUD_BLOCKED as expected), so the banner reason read "the latest satellite scan failed". Reason is taken from the newest scan's status. CLOUD_BLOCKED / NO_VALID_SCENE / none / load-error wording is covered by unit tests only, not live screenshots.
- The demo field boundary is very small, so sample zones show "0.00 ha" and are barely visible at zoom 16. Shapes are correct but the preview looks sparse on tiny fields.
- Dashboard and exports do not consume satellite data today; the guard is a type/runtime assertion for future code, not enforced by a lint rule.
- Browser check observed one localStorage write (`fasalguard.onboarding.v1`), pre-existing and unrelated to satellite; the check asserts nothing satellite/sample is stored.
- Accessibility was checked via roles, text content and no horizontal scroll at 390px; no screen reader or contrast tool was run (360px not separately tested).
- "Provider not configured" is not distinguishable from a failed scan with current API data, so it is reported as "scan failed".
