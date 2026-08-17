# FasalGuard AI security policy

## Reporting vulnerabilities

Do not open public issues containing vulnerabilities, credentials, farmer information, access tokens, signed URLs, or exact field locations. Report security issues privately to the project maintainers with reproduction steps, affected version, and impact. Revoke exposed credentials immediately.

## Security boundaries

- The NestJS API is the only trusted gateway to PostgreSQL/PostGIS, Redis, OSS, Copernicus, Open-Meteo, Qwen, Roboflow, and Firebase. Provider credentials must never be placed in `NEXT_PUBLIC_*`, web bundles, mobile bundles, logs, Swagger examples, or API responses.
- Authentication uses short-lived signed access tokens and rotating opaque refresh tokens. Refresh tokens are stored only as SHA-256 hashes; reuse revokes the complete token family. Passwords use Argon2id.
- Global DTO validation transforms input, removes no unknown properties silently, and rejects non-whitelisted or unknown values. SQL uses positional parameters. Dynamic SQL identifiers must come only from server allowlists.
- Farmer, farm, field, scan, media, report, task, and consultation access is checked against the authenticated principal in database queries. Expert case access requires an active assignment. Administrative and aggregate endpoints use explicit role guards.
- Exact farm boundaries, centroids, private outbreak locations, and farmer identity are private. Community responses use regional grid geometry only. Never add exact geometry to public/community serializers, analytics events, notifications, model prompts, or logs.
- OSS objects are private. Upload and download authorization is short-lived and capped at 15 minutes (five minutes by default). Object keys and permanent public URLs are not API fields.
- Direct image uploads are checked twice: declared size/type/checksum at completion and decoded file signature/dimensions before becoming usable. A mismatched or decompression-bomb image is marked failed.
- AI text is untrusted. Farmer text is passed as data beneath server-side system prompts. Structured outputs are validated against allowlists. Models cannot execute mutations, invent chemical guidance, or override approved agronomic guidance.

## Production requirements

Production startup fails validation when Swagger is enabled, CORS contains a wildcard, the JWT secret is weak, development OTP is selected, or private Alibaba OSS credentials are absent. Credentials required by selected Qwen, Roboflow, and Firebase adapters must be configured through the runtime secret store.

Use TLS at the ingress, `DATABASE_SSL=true` where supported, `rediss://` for remote Redis, a least-privilege database account, private networking for internal inference services, bucket policies denying public access, and separate credentials per environment. Rotate JWT/provider secrets through the deployment secret manager; never commit `.env` files. `.env.example` contains placeholders only.

Requests are globally throttled, authentication and community mutation routes have stricter limits, report generation is limited per user, JSON/form bodies are size limited, upload size/type is purpose-specific, and list responses are bounded. Queue jobs must remain idempotent and have bounded attempts, concurrency, and retention.

## HTTP and logging

The API sends restrictive CSP, frame, MIME-sniffing, referrer, cross-origin, permissions, and product-disclosure headers. CORS allows explicit configured origins only. Swagger is disabled by default and cannot persist bearer authorization.

Structured logs redact authorization, cookies, API keys, passwords, tokens, checksums, private keys, and secrets. Do not log request/response bodies, model input containing farmer data, exact geometry, signed URLs, raw provider credentials, or full external error payloads. Correlation IDs may be logged.

## Webhooks and SSRF

No inbound provider webhook is currently enabled. Any future webhook must authenticate before parsing/processing, verify a provider signature over the raw body, enforce timestamp/replay windows, apply a body limit, and be idempotent.

External destinations are environment-controlled, never supplied by API callers. Public provider origins must be credential-free HTTPS URLs in production. Firebase OAuth is pinned to `oauth2.googleapis.com`; service-account `token_uri` cannot redirect requests to an arbitrary host. New outbound adapters must use an allowlisted HTTPS origin in production, timeouts, bounded response sizes, retry limits, and normalized errors. Do not follow caller-controlled URLs or redirects to private/link-local networks.

## Verification checklist

Run from `services/api`: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`. Run database-backed integration tests against an isolated PostGIS instance. Review dependency advisories and secret-scanning results before release. Security controls must not be bypassed to satisfy tests.
