# Production observability

## Endpoints

- `GET /api/v1/health` is a lightweight process-liveness probe. It must not call dependencies.
- `GET /api/v1/ready` checks PostgreSQL, PostGIS, Redis, and object-storage configuration. These
  are required. The response also reports the AI service, but an unavailable optional AI provider
  does not make the API unready.
- `GET /api/v1/metrics` emits Prometheus text when `METRICS_ENABLED=true`. Supply
  `Authorization: Bearer <METRICS_TOKEN>`. Production startup rejects enabled metrics without a
  token. Restrict this route to the monitoring network as an additional deployment control.

Recommended probe configuration uses `/health` for liveness and `/ready` for readiness, with a
failure threshold that tolerates short database or Redis restarts. Do not use optional provider
status as a pod restart signal.

## Logs and correlation

The API emits structured JSON through Pino. Incoming `X-Request-Id` values are accepted only when
they match the bounded request-ID format; otherwise a UUID is generated. Return the request ID to
the client and include it when investigating a request across API and worker logs.

Request completion records include method, route template, status, and latency. They intentionally
exclude request bodies, query strings, exact coordinates, and farmer data. Logging configuration
redacts authorization, cookies, passwords, tokens, provider keys, and signed URL query values.
Never add raw DTOs, GeoJSON, provider authorization responses, image metadata, or conversation
content to log statements.

## Metrics

The registry reports request counts/latency, provider latency and failure counts, queue wait and
processing duration, failed jobs, satellite stage duration, crop inference duration, Qwen token
usage, Open-Meteo calls, and FCM delivery failures. Labels are deliberately low-cardinality:
provider, operation, queue, job name, route template, method, and status. Never label metrics with
user, farm, field, case, device, report, scene, or request IDs.

The registry is process-local. Prometheus must scrape every API/worker replica and aggregate at
query time. A future deployment that cannot scrape individual replicas should replace
`MetricsService` behind its existing interface with the platform-native collector.

Suggested alerts:

- readiness unavailable for more than five minutes;
- sustained HTTP 5xx ratio or latency regression;
- queue failed-job increase or queue-latency backlog;
- Copernicus, Open-Meteo, Qwen, vision, or FCM failure-rate increase;
- satellite/crop processing duration outside its normal baseline;
- no successful worker activity while queue depth is non-zero.

Provider outages should degrade their feature and trigger an operational alert; they must not be
presented to farmers as a crop emergency.

## Error reporting

Set `SENTRY_DSN` and `SENTRY_ENVIRONMENT` to enable the Sentry-compatible adapter. The adapter sends
only a generic error value, sanitized stack frames, and allowlisted technical tags: request ID,
method, route template, status, component, and operation. It does not attach request data, users,
breadcrumbs, environment variables, tokens, farmer details, or coordinates. Error reporting has a
short timeout, follows no redirects, and cannot break the request path.

Treat monitoring access as privileged. Rotate `METRICS_TOKEN` and the Sentry DSN through the secret
manager, never source control. Validate the monitoring vendor's retention, access control, and data
residency before production enablement.

## Incident checklist

1. Start with `/ready` and the correlation ID from the affected response.
2. Check request latency, queue latency, failed jobs, and the relevant provider counters.
3. Retry idempotent jobs only after identifying the failure mode; never bulk-retry blindly.
4. For invalid FCM tokens, allow the notification worker to deactivate them.
5. For quota/authentication failures, verify server-side secret configuration without printing it.
6. Confirm recovery through successful counters and a representative non-destructive request.
7. Record the incident without exact field geometry, farmer identity, credentials, or signed URLs.
