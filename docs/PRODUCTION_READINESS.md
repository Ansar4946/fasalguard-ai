# Production readiness

## Authentication scope

- Nest authentication/RBAC integration tests cover registration, login, current user, refresh rotation/reuse, session listing/revocation and forbidden roles.
- Frontend lint and production build are required before release.
- Deployment must define server-only `FASALGUARD_API_URL` and backend JWT/database/Redis variables.
- HTTPS is required so browser cookies receive the `Secure` flag.

## Manual browser verification

1. Start PostgreSQL, Redis, API and frontend.
2. Login with a database user; confirm response contains no tokens and browser cookies are HttpOnly.
3. Refresh a protected page and confirm session persists.
4. Open a forbidden role workspace and confirm role redirect.
5. Revoke the session from another client and confirm protected navigation redirects to login.
6. Logout, refresh and use browser Back; protected content must not return.
7. Stop the API and verify login/session checks show a safe unavailable state without mock access.

Dashboard and domain screens are not production-connected yet and must not be presented as real operational data.
