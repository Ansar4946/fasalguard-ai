import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type { MarketHistoryQueryDto, MarketPricesQueryDto } from './market.dto';

interface MarketPriceRow {
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
  priceDate: string;
  observedAt: Date;
}

@Injectable()
export class MarketService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async current(query: MarketPricesQueryDto): Promise<unknown> {
    const version = (await this.redis.get('market:prices:version')) ?? '0';
    const key =
      `market:prices:${version}:${query.crop ?? '*'}:${query.district ?? '*'}:${query.province ?? '*'}:${query.limit}`.toLowerCase();
    const cached = await this.redis.get(key);
    if (cached) return { ...JSON.parse(cached), cache: 'HIT' } as unknown;
    const values: unknown[] = [];
    const filters = ['1=1'];
    if (query.crop) {
      values.push(query.crop);
      filters.push(`lower(crop_name)=lower($${values.length})`);
    }
    if (query.district) {
      values.push(query.district);
      filters.push(`lower(district)=lower($${values.length})`);
    }
    if (query.province) {
      values.push(query.province);
      filters.push(`lower(province)=lower($${values.length})`);
    }
    values.push(query.limit);
    const records = await this.db.query<MarketPriceRow[]>(
      `SELECT DISTINCT ON(crop_name,market_name) id,crop_name "cropName",market_name "marketName",district,province,minimum_price "minimumPrice",maximum_price "maximumPrice",average_price "averagePrice",quantity,unit,source,price_date "priceDate",created_at "observedAt"
       FROM mandi_prices WHERE ${filters.join(' AND ')}
       ORDER BY crop_name,market_name,price_date DESC,created_at DESC LIMIT $${values.length}`,
      values,
    );
    const result = {
      records,
      freshness: records.length ? 'LIVE' : 'UNAVAILABLE',
      source: records.length ? 'AMIS' : null,
      generatedAt: new Date().toISOString(),
      cache: 'MISS',
    };
    await this.redis.setJson(key, result, this.config.get<number>('marketCacheTtlSeconds', 3600));
    return result;
  }

  async history(query: MarketHistoryQueryDto): Promise<unknown> {
    const values: unknown[] = [query.crop, query.days];
    const marketFilter = query.market
      ? (values.push(query.market), `AND lower(market_name)=lower($${values.length})`)
      : '';
    values.push(query.limit);
    const records = await this.db.query<MarketPriceRow[]>(
      `SELECT id,crop_name "cropName",market_name "marketName",district,province,minimum_price "minimumPrice",maximum_price "maximumPrice",average_price "averagePrice",quantity,unit,source,price_date "priceDate",created_at "observedAt"
       FROM mandi_prices WHERE lower(crop_name)=lower($1) AND price_date>=CURRENT_DATE-($2::integer-1) ${marketFilter}
       ORDER BY price_date DESC,market_name LIMIT $${values.length}`,
      values,
    );
    return {
      records,
      source: records.length ? 'AMIS' : null,
      freshness: records.length ? 'LIVE' : 'UNAVAILABLE',
    };
  }

  async invalidateCache(): Promise<void> {
    // Versioned namespace makes all prior summaries unreachable without using Redis KEYS/SCAN.
    await this.redis.setJson('market:prices:version', Date.now(), 7 * 86400);
  }
}
