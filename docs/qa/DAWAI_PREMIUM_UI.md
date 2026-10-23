# Dawai Check premium UI: what changed and how it was verified

Date: 2026-10-23. Web only (no API, BFF, flag, contract or dependency change). Screenshots and scripts: `docs/qa/dawai-premium/` (`before-*` = old build, `MOCKED-*` = mocked BFF visual pass, `REAL-*` = real end-to-end).

## What changed
- **Header**: compact green gradient hero with dot pattern, soft glow, inline-SVG shield-and-leaf emblem, one-line promise, polished Urdu/English segmented control, and a black/yellow `DEMO DATASET` chip that expands an honest explanation (sample list, not the official registry).
- **Navigation**: New check / History and Scan label / Type the name are segmented controls with an animated sliding indicator (mirrors in RTL). Steps cross-fade with a CSS-only view transition.
- **Capture**: compact scanner card with animated corner brackets, idle scan beam, drag-and-drop highlight, big camera button with press ripple and guarded haptic, separate gallery button (same single file input, `capture` attribute toggled), three tip chips (light, flat, no glare), photo preview with Retake / Choose another, an on-device quality hint (tiny, dark, glare, blurry; never blocks), inline file type/size errors.
- **Analysing**: your photo with a sweeping beam and brackets, stage list with check-draw animation when the real upload finishes; the three server steps show as one in-progress group (no percentages); shimmer skeleton.
- **Result**: colour-coded gradient hero (green, amber, red, neutral) with animated shield, risk ring that draws up with a count-up and a RISK SCORE label (still hidden for UNREADABLE), DEMO DATASET badge, "What we read" editable chips with Edited tag and Check again, expandable check cards (failures first, failures open by default, staggered entrance, counts row), "How we scored this" accordion (describes only existing checks), next-step cards with icons, calm disclaimer strip in the hero plus the full disclaimer, two-column layout on desktop, sticky bottom action bar on mobile (Check another, Listen via the shared hook, Copy summary with Clipboard API and textarea fallback).
- **History**: verdict colour stripe, relative time ("3 minutes ago", Latin digits, falls back to the date after a week), verdict, Demo tag, risk score (not shown for unreadable), inline-SVG empty state with a CTA.
- **Manual**: combobox with highlighted matches, clear button, helper text, `DEMO Imidacloprid 20% SL` example chip, optional-details label.
- **Motion**: CSS keyframes only (`dc-` namespace appended to `app/globals.css`), plus one requestAnimationFrame count-up of about 1 s. `prefers-reduced-motion` removes beams, ripples, brackets, count-up and entrance animation and shows final states immediately.
- Strings: 36 new keys in both languages (real Urdu script); the key-parity and forbidden-wording tests still pass. `tipBrand`, `tipExpiry` and `takePhoto` are no longer shown but kept.

## Files
`components/dawai-check/*` (all 7), `features/dawai-check/ui.ts` (new pure helpers), `features/dawai-check/quality.ts` (new, canvas hint), `features/dawai-check/history.ts` (adds `relativeLabel`), `features/dawai-check/strings.ts`, `app/globals.css` (append-only), `tests/dawai-check/load.cjs` (resolves sibling `./x` modules), `tests/dawai-check/ui.test.cjs` (new).

## Results
| Check | Result |
| --- | --- |
| `node --test tests/dawai-check/dawai-check.test.cjs tests/dawai-check/ui.test.cjs` | PASS 25/25 (18 existing + 7 new: relative time, quality classification, highlight, share text, history relative label) |
| `npx tsc --noEmit` | PASS |
| `npx eslint components/dawai-check features/dawai-check "app/(farmer)/dawai-check"` | PASS |
| `next build` (flags per brief) | PASS (first attempt each time stopped on the Next.js security-notice error, the identical rerun succeeded) |
| Mocked visual/behaviour pass `mocked.cjs`, 360x740 and 1440x900, en and ur | PASS 122 checks, 0 FAIL |
| Real end-to-end (`real.cjs`, `real-verified-en.cjs`): verified, expired, banned, blank in English and Urdu | PASS (verdict titles, ring present except blank, no forbidden wording, no horizontal scroll, no page errors); real history (20 rows) and open item, real manual autocomplete and check also PASS |

Covered by the mocked pass: no horizontal scroll at 360 px, controls at least 44 px on mobile, RTL (`dir=rtl` in Urdu, indicator mirrored), expand/collapse checks, edit then Check again enabled, Copy summary (clipboard content verified), manual highlight/pick/example chip, history rows and reopen, empty history, file-type error, dark-photo hint, reduced-motion final state (ring, count, entrance opacity, beam hidden), keyboard focus order (DEMO chip, language, tabs, modes, camera, gallery, details, link) with visible outlines.

## Defects found while verifying (fixed)
- Brightness hint flagged the beige test label as glare; threshold raised (mean above 238 or more than 40% near-white).
- History colour stripe was overridden by the unlayered `.card` border; now set inline.
- Mobile "What we read" read-only fields made the page long; now a 2-column grid.

## Not verified / caveats
- The final one-line history stripe fix was rebuilt and re-checked with the mocked pass only; the real end-to-end ran on the previous build (identical apart from that stripe style).
- Haptic, camera capture on a real phone, drag-and-drop with a real mouse drag, and the Listen sound were not exercised (headless Chromium). Listen is present and toggles `aria-pressed`.
- Photo quality hint is a heuristic from a 256 px canvas; blur detection is deliberately conservative. Only generated labels were tried.
- Urdu copy for the new keys is not native-reviewed.
- Header language toggle wraps below the DEMO chip at 360 px (by design, avoids overflow); the scanner card sits roughly at the fold on a 740 px screen.
- The shell skip link (outside this feature) has no outline in the tab order; not changed.
- `real.cjs` needs a fresh login if the stored session is older than the token lifetime (the first real attempt got 401s for that reason).
