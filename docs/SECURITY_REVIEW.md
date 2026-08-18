# Frontend authentication security review

- Tokens are server-only HttpOnly cookies; no token is stored in local/session storage.
- Cookies are `Secure` in production, `SameSite=Lax`, explicitly scoped and expire.
- Login and logout BFF mutations enforce same-origin requests.
- Authentication errors do not disclose whether an account exists.
- Login prevents duplicate submission and handles validation, timeout, network, rate-limit and backend errors.
- Protected pages are gated in Next.js Proxy and all records remain protected by Nest guards/ownership queries.
- Role redirects use the backend current-user result. Browser role/user IDs are not accepted.
- Logout revokes the backend session and clears cookies even if the revocation request fails.
- API/provider secrets remain server-side and the frontend API URL is not `NEXT_PUBLIC`.
- OTP bypass was removed.

Remaining work: add a deployment-specific CSRF token if cookies are later used directly against state-changing general BFF endpoints; validate return URLs before enabling post-login return navigation; integrate registration without persisting sensitive onboarding fields in local storage.
