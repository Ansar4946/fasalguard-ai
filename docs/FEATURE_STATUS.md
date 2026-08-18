# Feature Status Matrix

Audited: 2026-08-17. Methodology: every route in `app/` traced to its component, every component's data source traced (backend `fetch` vs. static literal in `features/*/data.ts`), cross-checked against registered NestJS modules in `services/api/src/app.module.ts` and the real Postgres schema.

**Structural finding driving most rows below**: the only files anywhere in `app/`, `components/`, `features/` that call `fetch()` against the backend are the five `app/api/auth/*` routes and `components/auth/set-password-form.tsx`. Every other screen renders a literal array/object from a `features/*/data.ts` file.

| Feature | Frontend | Backend | DB | Real Data | Status |
|---|---|---|---|---|---|
| Authentication (login) | Real — `app/api/auth/login/route.ts` | Real — `auth.controller.ts` | `users`, `auth_sessions` | Yes | **COMPLETE** |
| Registration | Real for account fields — `app/api/auth/onboarding/route.ts` → `/auth/register` | Real | `users`, `consents` | Partial — farm/field draft from the wizard is never sent | **PARTIAL** |
| Login | Real, JWT access + rotating hashed refresh token | Real | `auth_sessions` | Yes | **COMPLETE** |
| Logout | Real | Real | `auth_sessions` | Yes | **COMPLETE** |
| Session persistence | Real — httpOnly cookies, `proxy.ts` refresh-and-retry | Real | `auth_sessions` | Yes | **COMPLETE** |
| Protected routes | Real — `proxy.ts` role-based redirect via `/auth/me` | Real | `users.role` | Yes | **COMPLETE** |
| Onboarding | UI present, `components/onboarding/*` | Account portion real; farm/field portion discarded | `users` only | Partial | **PARTIAL** — completion screen shows hardcoded "Growth prediction: 23 days", "Soil moisture 68%" as if real |
| User profile | No page exists | Entities exist (`farmer_profiles`) | `farmer_profiles` | No | **NOT IMPLEMENTED** (frontend) |
| Farm creation | Static 2-farm array (`features/farms/data.ts`) | Real, complete — `POST /farms`, `POST /farms/:farmId/fields`, PostGIS-validated | `farms`, `fields` | No | **MOCKED** (backend complete & unused) |
| Farm list/detail | Static | Real — `GET /farms`, `GET /farms/:id` | Real | No | **MOCKED** |
| Farm polygon/location | No map UI wired to backend | Real — `GET /farms/:id/geojson`, geometry validation | Real PostGIS | Backend only | **PARTIAL** |
| Crop selection | Static `<select>` options | `crops`/`crop_varieties` entities | Real | No | **MOCKED** (frontend) |
| Crop seasons / growth stages | Hardcoded strings | `crop_cycles` model exists | Real | No | **MOCKED**/no exposing controller found |
| Crop roadmap | Not found | Not found as dedicated feature | Partial | No | **NOT IMPLEMENTED** |
| Daily/Today's Farm Plan | Static 4-item checklist | Real — `farmer_tasks` CRUD in `notification.controller.ts` | `farmer_tasks` | No | **MOCKED** (backend complete & unused) |
| Farm tasks | Static, local `useState`, "complete" doesn't persist | Real | `farmer_tasks` | No | **MOCKED** |
| Weather | Static 7-day fixture (`features/intelligence/data.ts`) | Real — Open-Meteo, no fake fallback | `weather_forecasts` etc. | Backend only | **MOCKED** (frontend); backend **COMPLETE**, unused |
| Satellite | Static zone positions | Real — Sentinel Hub integration | `satellite_*` tables | Backend only | **MOCKED** (frontend); backend **COMPLETE**, unused |
| Crop diagnosis | **BROKEN** — fake staged progress animation + `mockDiagnosisRepository.analyze()` always returns identical "Cotton leaf rust 92%" regardless of image | Real — `POST /:id/analyse`, real vision provider default | Real | No | **BROKEN/MOCKED** — highest user-facing risk |
| Gemini/AI (farm-brain, assistant) | Local keyword-matching chatbot, never calls `/assistant` | Both `FARM_BRAIN_PROVIDER` and `ASSISTANT_PROVIDER` default to `'fake'`, **no production guard** (unlike media storage) | Real | No (frontend); config-dependent (backend) | **MOCKED** (frontend) / **PARTIAL-RISKY** (backend) |
| Incidents (outbreaks/severity) | Static; "Publish advisory" fabricates "1,420 relevant farmers" notified message, no backend call | Real — `POST /outbreaks`, `:id/verify`, severity endpoints | Real | No | **MOCKED**, includes a fabricated claim |
| Recommendations | 3 hardcoded strings | Real — action-plan generation | Real | No | **MOCKED** (backend complete) |
| Alerts/Notifications | Static array; report submit only sets local state | Real — full CRUD, push tokens | Real | No | **MOCKED** |
| Email | Real — SMTP via nodemailer, password-setup only | Real | n/a | Yes | **COMPLETE** (auth-triggered only) |
| Daily/weekly digests | No scheduled digest job found | Not found | — | — | **NOT IMPLEMENTED** |
| Season progress/harvest | No page | `crop_cycles` has fields, no read endpoint found | Partial | No | **NOT IMPLEMENTED** |
| Reports | No farmer-facing route; expert/government pages static | Real, complete — async report generation, impact/viability analytics | Real | No | **MOCKED/NOT IMPLEMENTED** (backend complete, unused) |
| Plans/subscriptions/billing | No UI anywhere | No controller/service — tables only read by analytics | `subscriptions` (schema only) | No | **NOT IMPLEMENTED** |
| Admin features | No admin route group | RBAC roles exist, no admin module | `users.role` | No | **NOT IMPLEMENTED** |
| Analytics | Static; government dashboard shows a metric internally labeled `"Demo platform accounts"` displayed as a live trend | Real — `GET /impact`, `GET /viability` | Real | No | **MOCKED**, includes an unlabeled fabricated metric |

## Summary counts

- **COMPLETE**: 6 (all auth/session related)
- **PARTIAL**: 3 (onboarding, farm polygon backend-only, registration draft loss)
- **MOCKED**: 15 (most farmer/expert/government screens — in nearly every case the real backend already exists and works)
- **BROKEN**: 1 (crop diagnosis — actively misleading, not just absent)
- **NOT IMPLEMENTED**: 6 (user profile UI, crop roadmap, digests, season/harvest, subscriptions/billing, admin)

## Read this alongside

- `docs/MOCK_DATA_AUDIT.md` — full file:line inventory of every mock, classified by production-reachability.
- `docs/API_INTEGRATION_MAP.md` (pre-existing, verified accurate) — page-to-endpoint mapping for the auth flows that *are* connected.
- `docs/PRODUCTION_BLOCKERS.md` — prioritized list combining this matrix with the security/database/env findings.
