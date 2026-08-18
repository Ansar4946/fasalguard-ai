import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EMAIL_PROVIDER, type EmailProvider } from '../auth/email/email-provider';
import { CropCycleStatus } from '../farms/farm.enums';
import { WeatherSuitability } from './weather.enums';
import { WeatherService } from './weather.service';

interface DueField {
  fieldId: string;
  fieldName: string;
  userId: string;
  email: string;
}

const rank: Record<WeatherSuitability, number> = {
  [WeatherSuitability.Beneficial]: 0,
  [WeatherSuitability.MostlyBeneficial]: 1,
  [WeatherSuitability.Caution]: 2,
  [WeatherSuitability.Harmful]: 3,
  [WeatherSuitability.Critical]: 4,
};

/**
 * Automatically evaluates weather risk for every active field with an active crop cycle and
 * emails the field owner when a genuinely actionable risk (HARMFUL/CRITICAL, not just
 * CAUTION-level noise) is detected. Runs independently of the farmer-facing
 * `GET /fields/:id/weather/risks` and `/suitability` endpoints, which remain
 * ownership-scoped and unaffected by this service.
 *
 * Dedup/rate-limiting strategy (see `weather_risk_alerts`): per field+risk-category, an
 * alert is (re-)sent only when either (a) no alert has ever been sent for that field+category,
 * (b) the matched severity for that category changed since the last alert (e.g. HARMFUL
 * escalating to CRITICAL, or de-escalating), or (c) at least `weatherAlertMinIntervalHours`
 * (default 12h) has passed since the last alert for that unchanged condition. This is
 * implemented as a single atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE` so it stays
 * correct even if multiple API replicas run the cron concurrently.
 */
@Injectable()
export class WeatherAlertService {
  private readonly logger = new Logger(WeatherAlertService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly weather: WeatherService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 */30 * * * *')
  async dispatchAlerts(): Promise<{ evaluated: number; alerted: number }> {
    const fields = await this.db.query<DueField[]>(
      `SELECT fi.id AS "fieldId",fi.name AS "fieldName",u.id AS "userId",u.email AS "email" FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id JOIN users u ON u.id=fp.user_id JOIN LATERAL (SELECT 1 FROM crop_cycles x WHERE x.field_id=fi.id AND x.status=$1 AND x.deleted_at IS NULL LIMIT 1) cc ON true WHERE fi.status='active' AND fi.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status='active' AND u.email IS NOT NULL LIMIT 500`,
      [CropCycleStatus.Active],
    );
    let alerted = 0;
    for (const field of fields) {
      try {
        if (await this.evaluateAndNotify(field)) alerted += 1;
      } catch (error) {
        this.logger.warn(
          `Weather alert evaluation failed for field ${field.fieldId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return { evaluated: fields.length, alerted };
  }

  private async evaluateAndNotify(field: DueField): Promise<boolean> {
    const assessment = await this.weather.assessField(field.fieldId);
    const risky = assessment.matches
      .filter((m) => rank[m.suitability] >= rank[WeatherSuitability.Harmful])
      .sort((a, b) => rank[b.suitability] - rank[a.suitability] || b.priority - a.priority);
    if (!risky.length) return false;
    const seenCategories = new Set<string>();
    let sentAny = false;
    for (const match of risky) {
      if (seenCategories.has(match.category)) continue;
      seenCategories.add(match.category);
      try {
        if (await this.notifyIfDue(field, match.category, match.suitability, match.message))
          sentAny = true;
      } catch (error) {
        this.logger.warn(
          `Weather alert email failed for field ${field.fieldId} (${match.category}): ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return sentAny;
  }

  private async notifyIfDue(
    field: DueField,
    category: string,
    suitability: WeatherSuitability,
    message: string,
  ): Promise<boolean> {
    const consent = await this.db.query<Array<{ granted: boolean }>>(
      `SELECT granted FROM consents WHERE user_id=$1 AND type='NOTIFICATIONS' ORDER BY recorded_at DESC,created_at DESC LIMIT 1`,
      [field.userId],
    );
    if (consent[0]?.granted !== true) return false;
    const minIntervalHours = this.config.get<number>('weatherAlertMinIntervalHours', 12);
    const dispatched = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO weather_risk_alerts(field_id,category,suitability,notified_at) VALUES($1,$2,$3,now())
       ON CONFLICT (field_id,category) DO UPDATE SET suitability=excluded.suitability,notified_at=excluded.notified_at,updated_at=now(),version=weather_risk_alerts.version+1
       WHERE weather_risk_alerts.suitability<>excluded.suitability OR weather_risk_alerts.notified_at<=now()-($4||' hours')::interval
       RETURNING id`,
      [field.fieldId, category, suitability, minIntervalHours],
    );
    if (!dispatched.length) return false;
    await this.email.sendWeatherAlert({
      recipient: field.email,
      fieldName: field.fieldName,
      condition: this.readable(category),
      suitability,
      guidance: message,
    });
    return true;
  }

  private readable(category: string): string {
    const words = category.toLowerCase().split('_');
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}
