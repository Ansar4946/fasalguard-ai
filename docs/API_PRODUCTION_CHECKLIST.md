# API Production Checklist

Audited: 2026-08-17, updated after the onboarding/auth fixes in this session. This is the complete inventory of every backend API needed to call this app "production-ready" from an API-surface perspective — split into APIs that **already exist and just need frontend wiring** (the bulk of the work) and APIs that **don't exist yet and need to be built**. Cross-reference with `docs/FEATURE_STATUS.md` (per-feature status) and `docs/MOCK_DATA_AUDIT.md` (what's currently faked in the UI).

All existing routes are versioned under `/api/v1` and protected by the global `JwtAuthGuard`+`RolesGuard` unless marked `@Public()`. "Wired?" reflects whether any frontend code currently calls it (verified — only auth is wired today).

---

## Part 1 — Already built, needs frontend wiring (~85 endpoints)

### Auth (`/auth/*`) — ✅ WIRED, complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create account (now emails login password — see this session's changes) |
| POST | `/auth/login` | Public | Login, returns access+refresh tokens |
| POST | `/auth/refresh` | Public | Rotate refresh token |
| POST | `/auth/password/setup-request` | Public | Request a password-setup email (currently unused by onboarding after this session's change; still useful as a general "forgot password" entry point if the login page adds one) |
| POST | `/auth/password/setup` | Public | Complete password setup via token |
| POST | `/auth/logout` | Any | Revoke one session |
| GET | `/auth/me` | Any | Current user |
| GET | `/auth/sessions` | Any | List own sessions |
| DELETE | `/auth/sessions/:id` | Any | Revoke one session by id |
| DELETE | `/auth/sessions` | Any | Revoke all sessions |

### Farms & Fields (`farms`, `fields`) — 🟡 PARTIALLY WIRED (2026-08-17)
| Method | Path | Roles | Purpose | Status |
|---|---|---|---|---|
| GET | `/farms` | Farmer | List own farms | ✅ Wired — `app/(farmer)/farms/page.tsx` |
| POST | `/farms` | Farmer | Create farm (PostGIS boundary validated) | ✅ Wired — `app/(farmer)/farms/new/page.tsx`, real Leaflet boundary-drawing map (`components/farms/boundary-picker.tsx`), verified end-to-end incl. real PostGIS row |
| GET | `/farms/:id` | Farmer | Farm detail | ✅ Wired — `app/(farmer)/farms/[farmId]/page.tsx` |
| PATCH | `/farms/:id` | Farmer | Update farm | Next.js API route built (`app/api/farms/[farmId]/route.ts`), no edit-farm UI yet |
| DELETE | `/farms/:id` | Farmer | Delete farm | Next.js API route built, no delete UI yet |
| GET | `/farms/:id/geojson` | Farmer | Farm boundary as GeoJSON | Next.js API route built, not yet consumed by a page |
| POST | `/farms/:farmId/fields` | Farmer | Create field within a farm | Next.js API route built (`app/api/farms/[farmId]/fields/route.ts`), not yet wired to the Fields tab / `add-field-dialog.tsx` |
| GET | `/fields/:id` | Farmer | Field detail | Next.js API route built, `app/(farmer)/farms/[farmId]/fields/page.tsx` still on mock data |
| PATCH | `/fields/:id` | Farmer | Update field | Next.js API route built, no UI yet |
| DELETE | `/fields/:id` | Farmer | Delete field | Next.js API route built, no UI yet |
| GET | `/fields/:id/summary` | Farmer | Field summary (health/status rollup) | Next.js API route built, not yet consumed |
| GET | `/fields/:id/geojson` | Farmer | Field boundary as GeoJSON | Next.js API route built, not yet consumed |

Added this session: `lib/auth/server-session.ts`'s `authenticatedJson()` helper (reusable authenticated backend-proxy for any Next.js route handler, with one-retry-on-401 refresh — use this for all future wiring instead of re-deriving the pattern), `lib/geo/polygon.ts` (Leaflet↔GeoJSON conversion), `components/farms/boundary-picker.tsx` + `boundary-preview.tsx` (Leaflet, installed as a new dependency, no API key required). The farm detail page's weather/satellite/alerts/NDVI sections were also cleaned up to show honest empty states instead of fabricated numbers, since they were about to attach to real farm records — those get wired for real in the Weather/Satellite/Notifications phases below.

**Update 2026-08-17 (second pass, 3 parallel agents)**: Fields tab, edit/delete farm UI, and onboarding integration are now all done too.
- Fields tab (`app/(farmer)/farms/[farmId]/fields/page.tsx`, `components/fields/fields-management.tsx`, `add-field-dialog.tsx`) — real field creation via `BoundaryPicker`, verified end-to-end (`201`, real PostGIS row, correct area/containment). **Confirmed gap**: there is no `GET /farms/:id/fields` backend endpoint — `farm-management.controller.ts`'s route list has no way to list a farm's fields. The page honestly shows only fields created in the current browser session with a visible banner explaining why, rather than fabricating a list. Add this endpoint before this page can show real persisted history.
- Edit farm (`app/(farmer)/farms/[farmId]/edit/page.tsx`, `components/farms/edit-farm-form.tsx`) and delete (`components/farms/delete-farm-button.tsx`) — both wired to the already-built `PATCH`/`DELETE` routes, verified end-to-end including a real `FARM_BOUNDARY_EXCLUDES_FIELDS` validation encounter (see note below) and a real cascade-delete confirmed via DB.
- Onboarding (`components/onboarding/farm-setup.tsx`, `features/onboarding/*`) — the fake "tap to pinpoint" button is now a real `BoundaryPicker`; on completion, the account is registered, then a real farm + first field are created via the same boundary (deliberately reused for both — field boundary = farm boundary at onboarding time, refinable later). Farm-creation failure doesn't block reaching the dashboard (shown as a non-blocking banner). The fabricated "Growth prediction: 23 days", "Soil moisture 68%", "Pest activity: none" placeholders in `onboarding-complete.tsx` are removed.
- **Note for anyone editing a farm's boundary**: since onboarding makes the field boundary identical to the farm boundary, editing the farm's boundary without expanding it can trip the backend's `ST_CoveredBy` containment check (`FARM_BOUNDARY_EXCLUDES_FIELDS`) — this is correct, working validation, not a bug; the UI should probably say so explicitly rather than a generic error (small polish item, not filed as a blocker).
- Added `SizeInvalidator` to `components/farms/boundary-map-inner.tsx` (calls `map.invalidateSize()` shortly after mount) — good defensive practice for maps in constrained/scrollable containers, though the specific issue investigated this session turned out to be a synthetic-click test artifact, not a real product bug (verified: real backend response, real PostGIS row, correct geometry, once tested with realistic interaction timing).

**Still remaining**: `GET /farms/:id/fields` backend endpoint (to make the Fields tab show real persisted data instead of session-only), and everything else in Part 1 below (weather, satellite, tasks, etc.).

### Weather (`fields/:id/weather/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/fields/:id/weather/current` | Farmer | Current conditions |
| GET | `/fields/:id/weather/forecast` | Farmer | Forecast |
| GET | `/fields/:id/weather/risks` | Farmer | Weather-driven risk flags |
| GET | `/fields/:id/weather/suitability` | Farmer | Crop-weather suitability rules output |

**Frontend work**: replace `features/intelligence/data.ts` weather fixtures in `components/intelligence/weather-intelligence.tsx`.

### Satellite (`fields/:fieldId/satellite-scans`, `satellite-scans/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/fields/:fieldId/satellite-scans` | Farmer | Trigger a satellite scan |
| GET | `/fields/:fieldId/satellite-scans` | Farmer | List scans for a field |
| GET | `/satellite-scans/:id` | Farmer | Scan detail |
| GET | `/satellite-scans/:id/layers` | Farmer | Imagery layers |
| GET | `/satellite-scans/:id/statistics` | Farmer | NDVI/NDMI stats |
| GET | `/satellite-scans/:id/stress-zones` | Farmer | Detected stress zones (non-diagnostic labels) |
| GET | `/satellite-scans/:id/evidence` | Farmer | Supporting evidence for anomaly assessment |
| GET | `/fields/:id/satellite-comparison` | Farmer | Before/after comparison |

**Frontend work**: replace `features/intelligence/data.ts` satellite zone fixtures in `components/intelligence/satellite-workspace.tsx`.

### Crop scans / diagnosis (`crop-scans/*`) — ❌ NOT WIRED, backend complete — **P0 priority**
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/crop-scans` | Farmer | Start a scan |
| POST | `/crop-scans/:id/images` | Farmer | Attach an uploaded image |
| POST | `/crop-scans/:id/analyse` | Farmer | Run real vision-model diagnosis |
| GET | `/crop-scans/:id` | Farmer | Scan/diagnosis result |
| POST | `/crop-scans/:id/severity` | Farmer | Calculate severity |
| GET | `/crop-scans/:id/severity` | Farmer | Latest severity assessment |
| POST | `/crop-scans/:id/follow-up/questions` | Farmer | Generate follow-up questions |
| GET | `/crop-scans/:id/follow-up/questions` | Farmer | Fetch follow-up questions |
| POST | `/crop-scans/:id/follow-up/answers` | Farmer | Submit answers |
| POST | `/crop-scans/:id/explanation` | Farmer | Plain-language explanation of diagnosis |
| POST | `/crop-scans/:id/action-plan` | Farmer | Generate treatment action plan |
| GET | `/action-plans/:id` | Farmer | Fetch a generated action plan |

**Frontend work**: this is the fix for `docs/MOCK_DATA_AUDIT.md` finding #1 (the always-identical fake diagnosis) — replace `features/diagnosis/mock-repository.ts` entirely in `app/(farmer)/scan/*`. Highest-priority item in this whole list given it actively misinforms users today.

### Media / uploads (`uploads/*`, `media/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/uploads/presign` | Any | Get a presigned upload URL |
| POST | `/uploads/complete` | Any | Confirm upload completed |
| GET | `/media/:id/access-url` | Any | Get a signed read URL for a private asset |

**Frontend work**: needed as a dependency of crop-scan image upload and any farm/field photo evidence.

### Farm Digital Twin (`farms/:farmId/digital-twin`, `.../timeline`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/farms/:farmId/digital-twin` | Farmer | Aggregated read-model snapshot (health, tasks, satellite, weather, risk in one call) |
| GET | `/farms/:farmId/timeline` | Farmer | Event timeline |

**Frontend work**: this is likely the single most efficient endpoint to wire first for the dashboard — it's already a purpose-built aggregation of farm state (see `docs/FARM_DIGITAL_TWIN.md`), so wiring it could replace several dashboard mock fixtures in one pass.

### Farm Brain / Gemini (`farms/:farmId/farm-brain/*`) — ❌ NOT WIRED, backend implemented but **defaults to fake provider (fix before wiring — see P0 #3 in `docs/PRODUCTION_BLOCKERS.md`)**
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/farms/:farmId/farm-brain/investigations` | Farmer | Start a Gemini "Investigation Mode" run |
| GET | `/farm-brain/runs/:id` | Farmer | Run status/result |
| POST | `/farm-brain/runs/:runId/tool-calls/:toolCallId/confirm` | Farmer | Confirm/execute a proposed tool call |

### Assistant (`assistant/*`) — ❌ NOT WIRED, backend implemented, same fake-provider caveat as farm-brain
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/assistant/conversations` | Farmer | Start a conversation |
| GET | `/assistant/conversations` | Farmer | List conversations |
| GET | `/assistant/conversations/:id` | Farmer | Conversation detail |
| POST | `/assistant/conversations/:id/messages` | Farmer | Send a message |
| POST | `/assistant/speech/transcribe` | Farmer | Voice → text |
| POST | `/assistant/speech/synthesize` | Farmer | Text → voice |

**Frontend work**: replaces the keyword-matcher in `components/conversations/farmer-assistant.tsx` (`docs/MOCK_DATA_AUDIT.md` #2).

### Tasks & Notifications (`tasks/*`, `notifications/*`, `devices/push-token`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/tasks` | Farmer | List farmer tasks |
| POST | `/tasks` | Farmer | Create a task |
| PATCH | `/tasks/:id` | Farmer | Update a task |
| POST | `/tasks/:id/complete` | Farmer | Mark complete |
| GET | `/notifications` | Farmer | List notifications |
| PATCH | `/notifications/:id/read` | Farmer | Mark read |
| POST | `/devices/push-token` | Farmer | Register a push token |
| DELETE | `/devices/push-token/:id` | Farmer | Remove a push token |

**Frontend work**: replaces `components/tasks/farmer-tasks.tsx` and `components/alerts/alerts-community.tsx` static arrays, and the hardcoded "2 unread notifications" badge in `components/layout/farmer-shell.tsx`.

### Risk (`fields/:id/risk-assessment`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/fields/:id/risk-assessment` | Farmer | Deterministic field risk score |

### Expert workflows (`expert/cases/*`, `consultations/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/expert/cases` | Expert/Admin | Case queue |
| GET | `/expert/cases/:id` | Expert/Admin | Case detail |
| POST | `/expert/cases/:id/assign` | Expert/Admin | Assign a case |
| POST | `/expert/cases/:id/confirm` | Expert/Admin | Confirm a diagnosis |
| POST | `/expert/cases/:id/reject` | Expert/Admin | Reject a diagnosis |
| POST | `/expert/cases/:id/request-more-info` | Expert/Admin | Request more info from farmer |
| POST | `/expert/cases/:id/recommendation` | Expert/Admin | Add recommendation |
| POST | `/expert/cases/:id/resolve` | Expert/Admin | Resolve case |
| POST | `/consultations` | Farmer/Expert | Start a consultation |
| GET | `/consultations` | Farmer/Expert | List consultations |
| GET | `/consultations/:id` | Farmer/Expert | Consultation detail |
| POST | `/consultations/:id/messages` | Farmer/Expert | Send a message |

**Frontend work**: this is where the fabricated "Decision saved. The farmer will be notified..." message in `components/expert/case-review.tsx` gets replaced with a real call (`docs/MOCK_DATA_AUDIT.md` #3).

### Knowledge base (`knowledge/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST/GET/PATCH/DELETE | `/knowledge/sources` | Editors | Manage guideline sources |
| POST/GET/PATCH/DELETE | `/knowledge/articles` | Editors | Manage articles |
| POST/GET/PATCH/DELETE | `/knowledge/guidelines`, `/knowledge/guidelines/:id` | Editors | Manage treatment guidelines |
| POST | `/knowledge/guidelines/:id/review` | Editors | Approve/reject a guideline |
| GET | `/knowledge/guidelines/:id/approvals` | Editors | Approval history |

**Frontend work**: backs `app/(farmer)/learning/*` (currently `features/learning/data.ts`) and expert content-management tooling (no admin UI exists for this yet — see Part 2).

### Outbreaks / community reports (`community/reports/*`, `outbreaks/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/community/reports` | Community roles | Submit an anonymous community disease report |
| POST | `/community/reports/:id/verify` | Farmer | Verify a nearby report |
| GET | `/outbreaks` | Map roles | List outbreak clusters |
| GET | `/outbreaks/map` | Map roles | Map data |
| GET | `/outbreaks/:id` | Map roles | Cluster detail |

**Frontend work**: replaces the fake "Publish advisory... 1,420 farmers notified" flow (`docs/MOCK_DATA_AUDIT.md` #4) and `components/alerts/alerts-community.tsx`'s fake submit.

### Reports & Analytics (`reports/*`, `analytics/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/reports` | Various | Queue a report for generation (returns 202) |
| GET | `/reports` | Various | List reports |
| GET | `/reports/:id` | Various | Report status/download |
| GET | `/analytics/impact` | NGO/Gov/Admin | Impact metrics |
| GET | `/analytics/viability` | NGO/Gov/Admin | Business viability metrics |

**Frontend work**: `app/(expert)/expert/reports`, `app/(government)/government/reports|impact` need real calls; also fixes the "Demo platform accounts" metric shown as live (`docs/MOCK_DATA_AUDIT.md` #7). No farmer-facing reports page exists yet — may need one, see Part 2.

### Sync (offline support) (`sync/*`) — ❌ NOT WIRED, backend complete
| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/sync/mutations` | Farmer | Submit offline-queued mutations idempotently |
| GET | `/sync/changes` | Farmer | Cursor-based change feed |

**Frontend work**: not urgent unless offline support is an actual product requirement — flag to confirm before investing here.

### Admin (`admin/integrations/usage`) — partially exists
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/admin/integrations/usage` | Admin/SuperAdmin | Provider usage stats |

This is the *only* admin endpoint that exists. There's no admin route group in the frontend at all (see Part 2).

---

## Part 2 — Does not exist yet, needs to be built

These are gaps identified in `docs/FEATURE_STATUS.md` where no controller/endpoint exists at all, even though some have partial backing (a DB table, an entity) already in place.

| API needed | Why it's needed for production | Backing exists? |
|---|---|---|
| `GET /me/profile`, `PATCH /me/profile` | Farmers currently have no way to view/edit their own profile (`farmer_profiles`) after onboarding. Every real product needs this. | `farmer_profiles` table exists, no controller |
| `GET /crops`, `GET /crops/:id/varieties` | The onboarding/crop-selection UI hardcodes crop options in a `<select>`. Needs a real reference-data endpoint so new crops/varieties can be added without a frontend redeploy. | `crops`, `crop_varieties` tables exist and are seeded (5 crops), no controller exposes them |
| `POST /farms/:farmId/crop-cycles`, `GET/PATCH .../crop-cycles/:id` | "Crop seasons" and growth-stage tracking have a DB model (`crop_cycles`) but zero exposed endpoints. This is a real gap blocking the "crop season" and "crop roadmap" stages of the product lifecycle described in the project brief. | `crop_cycles` table exists, no controller |
| Crop roadmap / personalized-plan generation endpoint | Referenced in the product lifecycle (ONBOARDING → FARM → CROP → CROP SEASON → **PERSONALIZED ROADMAP** → DAILY FARM PLAN) but no dedicated feature exists on either side today — closest analog is Farm Brain investigations, which is a different (on-demand AI investigation) concept, not a generated roadmap. | Nothing — net-new design + build |
| `GET /farms/:farmId/season-report`, harvest completion endpoint | "Harvest" and "Season report" stages of the lifecycle have no backend representation at all. | Nothing — net-new design + build |
| Digest scheduling (`GET/PATCH /me/notification-preferences` already partially exists via `notification_preferences` table — confirm; daily/weekly digest cron + email template) | AGENTS.md explicitly calls for daily/weekly digest emails; none exist (no cron job, no template) | `notification_preferences` table exists; no digest job or endpoint |
| Subscriptions/billing (`GET /me/subscription`, `POST /subscriptions`, webhook endpoint for a payment provider) | `subscriptions`/`subscription_payments` tables exist and are read by analytics, but nothing creates or manages them — there is currently no monetization path at all. | Tables exist, no controller, no payment provider integrated (confirmed zero payment env vars/code in the earlier audit) |
| Admin dashboard APIs (user management, role assignment, content moderation for `knowledge`/`outbreaks`, org/pilot management) | `ADMIN`/`SUPER_ADMIN` roles are enforced in guards throughout the backend, but there's no admin module or frontend route group to actually use those permissions for anything beyond the one integrations-usage endpoint. | RBAC roles exist; no admin module |
| OTP-based login/verification endpoint | A full OTP provider abstraction (dev + production) exists and is validated in production config, but **no controller route exposes it** — it's entirely dead code right now. Either build the endpoint (if OTP login/verification is actually wanted) or remove the unused provider code to reduce surface area. | Provider infra exists, no controller — decide intent first |

---

## Suggested build order (ties into `docs/MOCK_DATA_AUDIT.md`'s remediation order)

1. **Crop diagnosis** (`crop-scans/*`) — fixes the actively-misleading mock, highest priority regardless of anything else.
2. **Farm Digital Twin** (`farms/:farmId/digital-twin`) — one endpoint, likely replaces most of the dashboard's mocked data in one pass.
3. **Farms/Fields CRUD** — unblocks real farm creation (currently the onboarding wizard's farm data is silently discarded).
4. **Weather, Satellite, Risk, Tasks, Notifications** — straightforward fetch swaps, backend already complete.
5. **Reference data**: `GET /crops` — small, unblocks a more honest onboarding crop-selection step.
6. **Farm Brain / Assistant** — after fixing the fake-provider-in-production gap (`docs/PRODUCTION_BLOCKERS.md` P0 #3).
7. **Expert / Outbreaks / Knowledge / Reports** — larger surface, mostly backend-complete, needs the fabricated-outcome UI fixes along the way.
8. **Net-new builds** (Part 2) — profile, crop cycles/seasons, roadmap, harvest/season report, digests, subscriptions, admin — these need product/design decisions first, not just wiring, and should be scoped as their own phase.
