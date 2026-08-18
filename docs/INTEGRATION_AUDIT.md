# Frontend integration audit

Audited 17 August 2026. The repository is a Next.js 16 App Router frontend plus a NestJS modular-monolith API, TypeORM, PostgreSQL/PostGIS, Redis/BullMQ and a FastAPI geospatial service. TypeORM remains the migration and runtime ORM; Prisma Studio is inspection-only.

The backend has authentication, farms, fields, Digital Twin, satellite, weather, crop scans, follow-up, severity, knowledge/action plans, expert review, outbreaks, risks, notifications/tasks, assistant, offline sync, reports, analytics and Gemini Investigation Mode. Before this pass, the frontend had no shared API client or authenticated user state and almost every feature screen consumed static feature data.

| Screen | Current data | Backend available? | API endpoint | Integration status | Priority |
|---|---|---:|---|---|---:|
| Login | Real backend through same-origin BFF | Yes | `/api/v1/auth/login` | COMPLETE | P0 |
| Logout | Real session revocation | Yes | `/api/v1/auth/logout` | COMPLETE | P0 |
| Current user | Real backend, refresh rotation | Yes | `/api/v1/auth/me`, `/refresh` | COMPLETE | P0 |
| Protected routes | Backend session and role validation in `proxy.ts` | Yes | `/api/v1/auth/me` | COMPLETE | P0 |
| Dashboard | Static component data | Partial aggregation only | Existing domain APIs; summary endpoint still needed | NOT CONNECTED | P0 |
| Farm list | `features/farms/data.ts` | Yes | `/api/v1/farms` | NOT CONNECTED | P0 |
| Farm detail | Static farm object and presentation values | Yes | `/api/v1/farms/:id`, `/digital-twin` | NOT CONNECTED | P0 |
| Digital Twin | Not consumed | Yes | `/api/v1/farms/:id/digital-twin`, `/timeline` | NOT CONNECTED | P0 |
| Satellite | `features/intelligence/data.ts` | Yes | `/api/v1/fields/:id/satellite-scans` | NOT CONNECTED | P1 |
| Weather | Static intelligence data | Yes | `/api/v1/fields/:id/weather/*` | NOT CONNECTED | P1 |
| Crop diagnosis | Mock repository and timer | Yes | media and crop-scan endpoints | NOT CONNECTED | P1 |
| Gemini Investigation | Not consumed | Yes | `/api/v1/farms/:id/farm-brain/investigations` | NOT CONNECTED | P1 |
| Incidents | Static UI | Stored through Digital Twin domain | Read contract needs dedicated UI endpoint | BLOCKED | P1 |
| Tasks | Static cards | Yes | `/api/v1/tasks` | NOT CONNECTED | P1 |
| Notifications | Static badge/cards | Yes | `/api/v1/notifications` | NOT CONNECTED | P1 |
| Analytics | Static governance data | Yes | `/api/v1/analytics/impact`, `/viability` | NOT CONNECTED | P2 |
| Profile/settings | Placeholder navigation | Partial | `/api/v1/auth/me`, notification preferences | BLOCKED | P2 |

## Infrastructure findings

- No React Query, SWR or server-action data layer exists.
- Redis supports queues and health; browser sessions are database-backed refresh sessions, not Redis sessions.
- Backend authorization uses global JWT and role guards plus service-level ownership queries.
- Frontend environment previously had no API URL contract. `FASALGUARD_API_URL` is now server-only.
- Backend development fake providers are configuration-isolated and forbidden or validated in production where applicable; frontend production screens still contain reachable mocks and are tracked separately.
