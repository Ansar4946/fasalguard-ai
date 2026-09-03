# AMIS Market-Price Pipeline

## Runtime architecture

```text
Nest scheduler (08:00 Asia/Karachi)
  -> BullMQ `market` queue in existing Redis
  -> existing `worker-1` / `worker` process
  -> internal FastAPI AMIS adapter
  -> TypeORM transaction into existing PostgreSQL
  -> versioned Redis read-cache invalidation
  -> authenticated NestJS API
```

No second worker, Supabase database, or browser-side scraper is used. PostgreSQL is the durable
source of truth; Redis only caches current-price responses. `MarketPriceProvider` is the replacement
boundary for a future PAR API adapter, so the REST and frontend contracts do not need to change.

## AMIS permission and safety gate

AMIS currently displays commodity prices as rupees per 100 kg. The adapter therefore persists
`quantity: 100` and `unit: "KG"`; it does not silently convert values to 40 kg. It retains the source
URL and a source identifier on every observation.

Automated access is **off by default**. Obtain written permission and confirm acceptable request
frequency before setting `AMIS_SYNC_ENABLED=true`. No fixture fallback exists in the ingestion path:
disabled or failed scraping never becomes apparently live data.

The Python adapter uses a fixed AMIS host allowlist, input limits, response-size and content-type
checks, timeouts, bounded retries, backoff, no redirects, and a configurable request delay.

## Storage and idempotency

Migration `1755000033000-market-intelligence` adds append-only `mandi_prices` observations with
normalized names, price range, fair/average price, explicit quantity/unit, provenance, and UTC audit
timestamps. Check constraints reject invalid price ordering. The unique key
`(crop_name, market_name, price_date, source)` makes repeated delivery safe. Crop/date, market/date,
and location/date indexes support current and historical reads.

## API

The application uses URI versioning. The endpoints are:

- `GET /api/v1/market/prices?crop=Wheat&province=Punjab&district=Lahore&limit=50`
- `GET /api/v1/market/history?crop=Wheat&market=Lahore&days=30&limit=200`

Both require an authenticated farmer, field worker, admin, or super-admin. Query DTOs are globally
validated and SQL filters are parameterized.

## Local startup

1. Keep `AMIS_SYNC_ENABLED=false` while validating the stack.
2. Run `docker compose up --build` from the repository root.
3. Confirm the `migrate` container completes and `/api/v1/ready` succeeds.
4. Only after source permission is confirmed, set `AMIS_SYNC_ENABLED=true` in the host environment
   and recreate `api`, `worker`, and `geospatial-ai`.
5. At 08:00 Pakistan time the API scheduler enqueues one deterministic job for the date. The existing
   worker consumes it and retries transient failures with exponential backoff.

Do not add an unauthenticated manual trigger endpoint for testing. Enqueue `sync_mandi_rates` on the
existing `market` queue from a controlled test or operator process.

## Known limitations

AMIS HTML is not a stable machine contract. A layout or label change causes a provider failure rather
than guessed data. Initial mappings cover Wheat, Maize, Rice IRRI, Seed Cotton (Phutti), and
Sugarcane. The page does not expose a separate district field, so the first adapter derives district
from the normalized displayed market name; migrate to an approved market reference table later.

The Market Intelligence frontend now uses authenticated Next.js proxy routes for these endpoints.
It displays AMIS provenance and observation dates, and never falls back silently to fixture prices.
