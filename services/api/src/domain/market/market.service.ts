import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { MarketHistoryQueryDto, MarketPricesQueryDto } from './market.dto';
import { approvedAmisUrl, dateAgeDays, priceFreshness } from './market-data-policy';

export interface MarketPriceRow {
  id: string;
  cropName: string;
  marketName: string;
  district: string;
  province: string;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
  quantity: number;
  unit: string;
  source: string;
  sourceUrl: string;
  sourceIdentifier: string;
  priceDate: string;
  observedAt: Date | string;
}
const columns = `id,crop_name "cropName",market_name "marketName",district,province,
  minimum_price "minimumPrice",maximum_price "maximumPrice",average_price "averagePrice",quantity,unit,source,
  source_url "sourceUrl",source_identifier "sourceIdentifier",price_date::text "priceDate",created_at "observedAt"`;

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private async read(sql: string, values: unknown[]): Promise<MarketPriceRow[]> {
    try {
      return await this.db.transaction(async (manager) => {
        await manager.query("SET LOCAL statement_timeout = '8s'");
        return manager.query<MarketPriceRow[]>(sql, values);
      });
    } catch {
      this.logger.warn('Market database read failed or timed out.');
      throw new ServiceUnavailableException({
        code: 'MARKET_DATA_UNAVAILABLE',
        message: 'Published market observations are temporarily unavailable.',
      });
    }
  }

  private response(rows: MarketPriceRow[], cache: string): Record<string, unknown> {
    const now = new Date();
    const maxAgeDays = this.config.get<number>('marketMaxAgeDays', 1);
    const records = rows
      .filter(
        (r) =>
          r.source === 'AMIS' &&
          r.unit === 'KG' &&
          r.quantity === 100 &&
          [r.minimumPrice, r.averagePrice, r.maximumPrice].every(
            (v) => Number.isFinite(v) && v > 0,
          ) &&
          r.minimumPrice <= r.averagePrice &&
          r.averagePrice <= r.maximumPrice &&
          dateAgeDays(r.priceDate, now) !== null &&
          approvedAmisUrl(r.sourceUrl),
      )
      .map((r) => ({
        ...r,
        district: null,
        districtVerified: false,
        currency: 'PKR',
        ingestedAt: r.observedAt,
        sourceCommodity: /^AMIS:([^:]+):/.exec(r.sourceIdentifier)?.[1] ?? null,
        freshness: priceFreshness(r.priceDate, maxAgeDays, now),
        ageDays: dateAgeDays(r.priceDate, now),
      }));
    return {
      records,
      source: records.length ? 'AMIS' : null,
      freshness: !records.length
        ? 'UNAVAILABLE'
        : records.some((r) => r.freshness === 'STALE')
          ? 'STALE'
          : 'LIVE',
      freshnessPolicy: { timeZone: 'Asia/Karachi', maxAgeDays },
      generatedAt: now.toISOString(),
      cache,
      forecast: {
        status: 'UNAVAILABLE',
        reason: 'NO_VALIDATED_FORECAST',
        message: 'Historical observations are not price forecasts.',
      },
    };
  }

  async current(query: MarketPricesQueryDto): Promise<unknown> {
    if (query.district)
      throw new BadRequestException({
        code: 'MARKET_DISTRICT_UNVERIFIED',
        message:
          'AMIS market names do not establish administrative districts; use crop and province filters.',
      });
    let key: string | null = null;
    try {
      const version = (await this.redis.get('market:prices:version')) ?? '0';
      key = `market:prices:v2:${version}:${JSON.stringify([query.crop, query.district, query.province, query.limit]).toLowerCase()}`;
      const cached = await this.redis.get(key);
      if (cached) {
        const value: unknown = JSON.parse(cached);
        if (Array.isArray(value)) return this.response(value as MarketPriceRow[], 'HIT');
      }
    } catch {
      this.logger.warn('Market read cache unavailable; reading PostgreSQL.');
    }
    const values: unknown[] = [];
    const filters = ["source='AMIS'"];
    for (const [value, column] of [
      [query.crop, 'crop_name'],
      [query.district, 'district'],
      [query.province, 'province'],
    ] as const) {
      if (value) {
        values.push(value);
        filters.push(`lower(${column})=lower($${values.length})`);
      }
    }
    values.push(query.limit);
    const records = await this.read(
      `SELECT DISTINCT ON(crop_name,market_name) ${columns} FROM mandi_prices WHERE ${filters.join(' AND ')}
       AND price_date <= (now() AT TIME ZONE 'Asia/Karachi')::date
       ORDER BY crop_name,market_name,price_date DESC,created_at DESC LIMIT $${values.length}`,
      values,
    );
    if (key)
      try {
        await this.redis.setJson(
          key,
          records,
          this.config.get<number>('marketCacheTtlSeconds', 3600),
        );
      } catch {
        this.logger.warn('Market cache write unavailable; returning PostgreSQL observations.');
      }
    return this.response(records, 'MISS');
  }

  async history(query: MarketHistoryQueryDto): Promise<unknown> {
    const values: unknown[] = [query.crop, query.days];
    const marketFilter = query.market
      ? (values.push(query.market), `AND lower(market_name)=lower($${values.length})`)
      : '';
    values.push(query.limit + 1);
    const records = await this.read(
      `SELECT ${columns} FROM mandi_prices WHERE source='AMIS' AND lower(crop_name)=lower($1)
       AND price_date BETWEEN (now() AT TIME ZONE 'Asia/Karachi')::date-($2::integer-1) AND (now() AT TIME ZONE 'Asia/Karachi')::date
       ${marketFilter} ORDER BY price_date DESC,market_name LIMIT $${values.length}`,
      values,
    );
    const truncated = records.length > query.limit;
    const selected = records.slice(0, query.limit);
    const excludedPartialDate =
      truncated && records[query.limit]?.priceDate === selected.at(-1)?.priceDate
        ? selected.at(-1)!.priceDate
        : null;
    return {
      ...this.response(
        selected.filter((r) => r.priceDate !== excludedPartialDate),
        'BYPASS',
      ),
      historyTruncated: truncated,
      excludedPartialDate,
    };
  }

  async invalidateCache(): Promise<void> {
    await this.redis.setJson('market:prices:version', Date.now(), 7 * 86400);
  }
}
