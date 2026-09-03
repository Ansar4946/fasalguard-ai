# Market Intelligence / Mandi Rates

## Frontend status

Market Intelligence is an authenticated page at `/market-intelligence`. It uses the existing
Next.js App Router, farmer shell, design tokens and responsive card conventions. Its current-price,
comparison and historical views now consume normalized AMIS observations through authenticated
Next.js proxy routes. Summaries are deterministic and are not AI price forecasts or selling advice.

The frontend depends on `MarketService`, which exposes:

- `getCurrentPrices`
- `getPriceHistory`
- `getNearbyMarkets`
- `getAIRecommendation`
- `createPriceAlert`
- `getMarketSummary`, used to load a consistent dashboard snapshot

The live adapter wraps `apiMarketRepository` and calls the existing NestJS API using the user's
HTTP-only authenticated session. Provider configuration never enters the browser bundle.

The production ingestion implementation is documented in
[`AMIS_MARKET_PIPELINE.md`](./AMIS_MARKET_PIPELINE.md).

## Existing-system integration

Phase 2 must remain inside the existing architecture:

```text
Approved market source (for example PAR/AMIS)
  -> BullMQ ingestion worker
  -> validation and normalization
  -> PostgreSQL/PostGIS history
  -> Redis read cache
  -> authenticated NestJS REST API
  -> Next.js MarketService adapter
```

TypeORM remains the application ORM and migration authority. Prisma Studio may inspect local
records but must not create or migrate this schema.

## Proposed REST surface

The future NestJS module should follow the application's existing URI versioning and authorization
conventions. Its initial owner-scoped endpoints should be:

- `GET /api/v1/market/prices?cropId=&province=&district=`
- `GET /api/v1/market/history?cropId=&mandiId=&range=`
- `GET /api/v1/market/nearby?cropId=&fieldId=&radiusKm=`
- `GET /api/v1/market/insight?cropId=&fieldId=`
- `POST /api/v1/market/alerts`

Writable DTOs must use global validation and reject unknown properties. Nearby-market queries
must authorize the referenced field before using its private centroid. API responses should expose
the distance result but never return a farmer's exact field coordinates.

## Existing worker integration

There is one BullMQ worker entry point at `services/api/src/worker.ts`; no additional worker service
is required. A future NestJS `market` domain module can register a market synchronization queue and
processor using the same patterns as satellite, weather, notifications and reports.

Suggested responsibilities are:

1. A scheduled producer enqueues a deterministic synchronization job per provider/date scope.
2. A replaceable PAR/AMIS provider adapter fetches records with timeout, retry and rate limiting.
3. The processor validates units and identifiers, normalizes records and performs idempotent writes.
4. Successful writes invalidate or replace the corresponding Redis summary cache.
5. A separate insight job derives evidence-backed trends from stored observations.

Provider failures must be logged and retried without converting old or fixture data into apparently
live observations. Job identifiers and source-record checksums should prevent duplicate ingestion.

## Proposed normalized schema

No database migration is included in Phase 1. A reviewed Phase 2 TypeORM migration should add:

### `mandis`

- UUID `id`
- `name`, `district`, `province`
- PostGIS `geography(Point,4326)` location with a GiST index
- source identity fields and UTC audit timestamps

The existing `crops` table should be reused. Add Urdu name, category or canonical market unit only
if the current crop schema cannot represent them; do not create a duplicate crops table.

### `mandi_prices`

- UUID `id`
- `crop_id`, `mandi_id`
- optional variety/grade identity
- `minimum_price`, `maximum_price`, `average_price`
- quantity and unit (never assume every quote uses 40 KG)
- `price_date`, `observed_at`, `ingested_at`
- `source`, `source_identifier`, `freshness`, raw-record checksum

Use unique source/source-identifier constraints for idempotent ingestion and indexes on
`crop_id`, `mandi_id`, `observed_at` and freshness/status. Historical observations are append-only;
do not overwrite an old price merely to hold the latest value. A separate `price_history` table is
unnecessary if `mandi_prices` already preserves that history.

### `market_price_alerts`

- UUID `id`, owner ID and crop ID
- optional mandi/location scope
- target price, quantity and unit
- active state, last-triggered timestamp and UTC audit fields

Alerts must enforce ownership, preferences, throttling and deduplicated queue delivery.

## Ingestion and data quality

The provider interface should normalize official data and retain provenance. Jobs should be
scheduled in BullMQ, idempotent, retryable, rate-limited and observable. Redis may cache current
summaries but PostgreSQL is the durable record. A scraper should not be implemented until source
terms, robots policy, licensing, rate limits and field semantics are verified.

Every API response must communicate whether data is live, stale, estimated, unavailable or demo,
plus source and observation time. If no trustworthy data exists, return an unavailable state rather
than silently substituting a fabricated live price.

## Recommendation safety

The current insight is deterministic demo copy. A future AI recommendation must cite price-history,
weather and crop-health evidence, expose uncertainty, and be logged with model/version information.
It must not promise a future price or present an unsupported confidence score. Farmers should still
verify crop grade, commission, transport cost, buyer terms and current market rates.
