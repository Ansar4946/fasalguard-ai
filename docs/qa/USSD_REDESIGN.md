# USSD demo redesign: QA notes

## What changed
- Short code is now `*3275#` (keypad letters F-A-S-L), exported once as `DEMO_SHORT_CODE` in `features/farm-finance/ussd-formatters.ts`. Replaced in `mobile/src/ussd.mjs` (`DEMO_CODE`, the Expo screen reads it, no other edit) and `docs/features/F09.md`. `docs/qa/` history untouched.
- `components/farm-finance/ussd-demo-workspace.tsx` keeps all state and API calls (session via `/api/ussd-demo/session`, PIN via `/api/ussd-demo/pin`, ledger via `/api/farm-ledger`, receipt verification, retry, stale-response guard). UI split into `components/farm-finance/ussd/`: Dialer, Keypad, UssdOverlay, PhoneFrame, StatusBar, ConsentSheet, ReceiptCard, PinCard, LedgerCard, ExplainCard, haptics.
- Mobile: full-bleed dialer app, status bar with SIMULATION pill, 3x4 keypad with ABC letters, round call button (idle pulse), backspace with long-press clear, paste (Ctrl+V and Paste button), keyboard digits/*/#/Backspace/Enter, Android-style USSD dialog (reply, Send, Cancel), keypad feeds replies while a dialog is open. lg: phone mockup (bezel, notch) beside explanation, PIN and ledger cards; tablet: stacked, centred.
- Consent: bottom sheet with the "I understand what this demo does." checkbox gates Continue, calls and Start simulator. Full SIMULATION wording (no operator connected, confirming creates a real ledger record) is in the sheet and in the side card.
- Motion in `app/globals.css` (press scale + ripple + glow, caret blink, call pulse, loading dots, sheet/dialog slide, tick draw); `prefers-reduced-motion` honoured; `navigator.vibrate(10)` guarded.
- Unit tests added to `tests/farm-finance/ussd-formatters.test.ts` (digit entry, cap, backspace, paste sanitising, short-code matching, reply digits, keyboard mapping).

## Commands and results
- `npx tsc --noEmit`: clean. `npx eslint components/farm-finance features/farm-finance tests/farm-finance`: clean.
- `node --test tests/farm-finance/*.test.ts`: 15 pass, 0 fail. `mobile: node --test tests/*.test.mjs`: 36 pass, 0 fail.
- Built (`STORAGE_UPLOAD_ORIGINS=http://localhost:4100 npm run build`) and restarted web on :3100 as specified.
- Playwright (`docs/qa/ussd-redesign/e2e.cjs`, `lib.cjs`), real browser against :3100, all PASS: no horizontal scroll at 360px (consent open and code typed); all dialer targets >= 44px at 360; Continue disabled until consent ticked at 390/768/1440; keyboard `#` and Backspace; long-press backspace clears; wrong code `*786#` shows "Connection problem or invalid MMI code. This demo answers only *3275#."; PIN card save returned "PIN configured. You can start the simulator." (real API).

## NOT verified end to end (blocker)
- The API on :4100 (and the one on :4101) has `USSD_DEMO_ENABLED` unset, so the real session returns 503 `USSD_DEMO_DISABLED` ("The USSD simulator is unavailable.", screenshots `10-backend-error-*`). I was told not to restart the API, and starting a separate USSD-enabled API instance needed DB credentials I was not permitted to read. So dial `*3275#` -> farm -> season -> category -> amount -> PIN -> confirm against the real backend was NOT run.
- The demo account `demo.farmer@example.com` has no phone number, so USSD PIN setup fails for it ("Current account credentials could not be verified."). I registered a QA farmer through the real API (`ussd.qa.redesign@example.com`, with a phone), and created farm "Golden rice" with a field and an active Rice crop cycle via the real API.
- Menu, review and receipt screenshots (`mock-06..09-*`) use Playwright `page.route` mocks of `/api/ussd-demo/session` and `/api/farm-ledger` with the real server message formats. They prove the UI only, not persistence.
- Old `tests/e2e/ussd-demo-live.cjs` selectors (start button visible behind the consent sheet, `p[role=status]` receipt banner) were not updated or run (needs an isolated stack).
- Not tested: real touch devices, screen readers, Safari/Firefox, contrast measured only by design (not a tool).

## Screenshots
`docs/qa/ussd-redesign/`: `01-consent`, `02-idle`, `03-typed`, `04-wrong-code` (390), `05-pin-card`, `10-backend-error` (real), `mock-06-menu`, `mock-07-review`, `mock-08-receipt`, `mock-09-ledger`, each at 390, 768 and 1440 widths.
