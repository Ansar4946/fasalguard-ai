# API integration map

| Frontend operation | Same-origin endpoint | Backend endpoint | Authentication behavior |
|---|---|---|---|
| Sign in | `POST /api/auth/login` | `POST /api/v1/auth/login` | Tokens become HttpOnly cookies; safe user returned |
| Restore user | `GET /api/auth/me` | `GET /api/v1/auth/me` | Access validation; one refresh rotation when required |
| Sign out | `POST /api/auth/logout` | `POST /api/v1/auth/logout` | Session revoked and cookies cleared |
| Protected navigation | `proxy.ts` | `GET /api/v1/auth/me`, optionally `POST /refresh` | Backend session and role checked before render |

The server-only base URL is `FASALGUARD_API_URL`. Browser components do not call the Nest host directly and cannot read backend tokens or provider secrets.

Future feature clients should reuse a centralized authenticated BFF/API layer rather than embedding bearer tokens or independent `fetch` policies inside components.
