# CI/CD and production deployment runbook

## Architecture and environments

Production uses Alibaba RDS PostgreSQL 17 with PostGIS, Alibaba Tair Redis, private Alibaba OSS,
and separate containers for the NestJS API, BullMQ worker, and FastAPI analysis service. The API
uses `PROCESS_ROLE=api`; the worker uses `PROCESS_ROLE=worker`. Development may use `all` for a
single-process experience. Environment examples under `deploy/environments` contain names and safe
defaults only. Actual staging and production values belong in the platform secret manager.

The pull-request workflow validates lint, types, unit and PostGIS integration tests, migrations,
API/worker builds, Python tests, dependency audits, and all three Docker builds. The production
artifact workflow is manual and publishes immutable images to Alibaba Container Registry. It does
not migrate a database or deploy containers.

## Release procedure

1. Confirm the pull-request workflow is green and review dependency-scan exceptions.
2. Choose an immutable semantic version; never reuse or overwrite an image tag.
3. Run **Production artifacts** in GitHub Actions. The protected `production-artifacts`
   environment must require approval and provide registry variables/secrets.
4. Scan the published image digests with the organization container scanner and record digests.
5. Take and verify an RDS backup before any schema change.
6. Deploy the AI service and worker/API images to staging using digest pins and injected secrets.
7. Run the migration as a separate one-shot task:

   ```bash
   docker compose --env-file /secure/staging-runtime.env \
     -f deploy/compose.production.yml --profile migration run --rm migrate
   ```

8. Verify `/api/v1/health`, `/api/v1/ready`, migration status, queue processing, and a read-only
   smoke test. Promote the same digests to production, run the separately approved migration task,
   then roll worker and API instances gradually.

Normal application startup never applies migrations. Only one migration task may run at a time.
The database account used by runtime containers should not have schema-alter privileges; provide a
short-lived, separately scoped migration credential to the migration task.

## Secrets and Alibaba services

Inject RDS/Tair URLs, OSS access, JWT material, Sentinel Hub, Qwen, FCM, monitoring, and registry
credentials at runtime. Do not use Docker build arguments for secrets. Prefer RAM roles/workload
identity for OSS where the runtime supports it; until that provider adapter is added, scope and
rotate access keys. Keep RDS and Tair on private networking and allow traffic only from application
security groups. Require TLS and verify the RDS CA in production.

## Rollback

Application rollback means redeploying the previously verified image digests. Stop or drain new
workers first when a job payload changed, then roll back API and worker together. Database rollback
is not automatically executed: TypeORM `migration:revert` can be destructive and requires review.
Prefer forward-fix migrations. If a schema change is incompatible:

1. stop writes and queue consumers;
2. preserve failed jobs and capture a fresh snapshot;
3. restore the pre-release RDS backup to a new instance;
4. verify row counts, PostGIS, migrations, and application smoke tests;
5. switch the secret-managed database endpoint during an approved maintenance window;
6. retain the failed database for investigation according to retention policy.

Never point production at an unverified restore or run destructive rollback SQL interactively.

## RDS backup and restore

Enable automated RDS backups with point-in-time recovery, cross-zone durability, encryption, and
retention matching policy. Before migrations, create a manual snapshot and wait for completion.
Regularly perform a restore drill into an isolated VPC/database:

1. restore the snapshot or selected point in time to a new RDS instance;
2. use a temporary read-only validation credential;
3. confirm `postgis` is installed and its version is compatible;
4. run `npm run migration:show` from the matching API image;
5. compare table/row counts and critical spatial queries;
6. run privacy-safe application smoke tests;
7. destroy the drill instance and credentials after evidence is recorded.

Logical exports may supplement snapshots for selected datasets, but must be encrypted, access
controlled, tested with `pg_restore --list`, and must not be copied to developer machines. Never
log database URLs or embed credentials in backup commands, shell history, CI artifacts, or images.
