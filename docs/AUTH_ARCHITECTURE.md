# Authentication architecture

## Existing backend

NestJS owns identity and authorization. Passwords use Argon2id. Login creates a database device session, returns a short-lived JWT access token and random refresh token, and stores only the SHA-256 refresh-token hash. Refresh tokens rotate transactionally; reuse revokes the complete token family. The JWT guard verifies issuer, audience, signature, token type, active database session and active user on every protected request. Role guards use the database role, not browser claims.

## Browser session bridge

The browser calls same-origin Next.js route handlers:

`LoginForm -> /api/auth/login -> Nest /api/v1/auth/login`

Next.js stores access and refresh tokens in `HttpOnly`, `SameSite=Lax` cookies. `Secure` is enabled in production. Client JavaScript receives only the safe user record. Both cookies are available to the server-side route guard so it can rotate an expired session before rendering a protected route; neither token is readable by client JavaScript, stored locally, or exposed through a `NEXT_PUBLIC` value.

`GET /api/auth/me` validates the access token and performs one refresh rotation when necessary. `POST /api/auth/logout` asks Nest to revoke the refresh session and always clears both cookies. Mutation handlers reject cross-origin browser requests.

Next.js 16 `proxy.ts` protects farmer, expert and government route groups before rendering. It validates the session with Nest, rotates an expired access token when possible, and checks the backend role. This is an early navigation gate; Nest remains authoritative for every data object.

## Limitations

- Registration/onboarding remains a later integration stage and currently stores draft UI state locally.
- Cookie lifetime for refresh currently mirrors the backend default of 30 days; centralizing this value is recommended if deployments change it.
- OTP remains visibly disabled until a production SMS provider exists.
