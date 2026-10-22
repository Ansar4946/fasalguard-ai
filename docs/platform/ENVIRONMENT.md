# Local platform environment

Secrets are provided through the root gitignored `.env` or deployment environment; do not commit values. `compose.platform.yml` requires `FG_POSTGRES_PASSWORD`, `FG_JWT_ACCESS_SECRET`, `FG_INTERNAL_SERVICE_TOKEN`, `FG_S3_ACCESS_KEY`, `FG_S3_SECRET_KEY`.

F02 uses shared PostGIS/Redis and the added platform-api service. Configuration names: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` (minimum32characters), `JWT_ISSUER`, `JWT_AUDIENCE`, `MEDIA_LOCAL_DIR`, `PLATFORM_CELERY_BROKER_URL` (Redis DB2), `PLATFORM_API_URL`, `FASALGUARD_API_URL`, `SATELLITE_MAX_PIXELS` (default1000000), `SATELLITE_PLATFORM_ENABLED` (defaultfalse).

Set the cutover flag consistently on web/core/platform to enable F02 routing/scheduled monitoring and disable the legacy automatic dispatcher. Worker consumes both default and satellite queues. Run exactly one beat; private media is shared read-only to API/read-write to worker, with matching UID1000 ownership. Network dependencies are the documented fixed EarthSearch/Sentinel S3 HTTPS hosts. See docs/features/F02.md for scientific limits and evidence.

This checkout's existing crop routes remain on Nest; copying the FastAPI support service does not migrate its F01 web flow or add the C: branch's internal crop-event controller.

No D: Compose deployment was started during synchronization. The existing C: stack uses the same default project name and host ports. Before launching another stack, select a separate project name, unused host ports and dedicated development volumes; do not replace the running stack accidentally. Preserve the existing root docker-compose.yml.

## F04 weather cutover

`WEATHER_PLATFORM_ENABLED` is a server-side web flag (default false). Set true only after applying
migration `1755000039000` and validating the platform service. False keeps the existing Nest
weather routes, including the legacy OpenWeatherMap provider. No destructive rollback is needed
to turn off the web cutover; retain the additive metadata column when rolling back the web flag.

F04 configuration names: `WEATHER_PROVIDER` (currently `open-meteo` only), `OPEN_METEO_API_KEY`
(commercial customer access; never expose to the browser), `WEATHER_CACHE_TTL_SECONDS`
(default 900, 60–3600), `WEATHER_MAX_STALE_SECONDS` (additional stale window, default 3600,
0–21600), plus the existing `DATABASE_URL`, `REDIS_URL`, JWT settings and `PLATFORM_API_URL`.
No new dependency packages are required. Production mode refuses weather requests without
commercial credentials, including cache hits. Deployment must set `NODE_ENV=production`;
this development compose file intentionally uses development mode.

Outbound HTTPS hosts are fixed: `api.open-meteo.com` for non-commercial development/testing,
`customer-api.open-meteo.com` when a commercial key is configured. API query logging is
suppressed to protect keys. Customer endpoint authentication must be tested by the operator;
public endpoint success does not verify the commercial subscription. Retain Open-Meteo CC BY
attribution. Redis is a performance cache; PostgreSQL stores validated field-specific fallback.
Run migration through the existing TypeORM migration owner, never through a separate Python
schema manager. F04 does not add another email scheduler or send any test email to real users.
