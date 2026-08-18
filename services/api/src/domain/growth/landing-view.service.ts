import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

/**
 * A minimal, honest visitor counter — one row per calendar day, incremented once per
 * caller (the Next.js proxy route dedupes repeat calls within a day via a short-lived
 * cookie). This is not bot-filtered and is a page-view proxy, not a unique-visitor
 * count — documented in docs/GROWTH_FEATURES.md rather than presented as more precise
 * than it is.
 */
@Injectable()
export class LandingViewService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async recordView(): Promise<void> {
    await this.db.query(
      `INSERT INTO landing_page_views(id,viewed_on,count,updated_at) VALUES($1,current_date,1,now())
       ON CONFLICT(viewed_on) DO UPDATE SET count=landing_page_views.count+1,updated_at=now()`,
      [randomUUID()],
    );
  }
}
