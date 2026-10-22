import { Injectable } from '@nestjs/common';
import { FarmLedgerService } from '../farm-finance/farm-ledger.service';
import { FarmManagementService } from '../farms/farm-management.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationCategory } from '../notifications/notification.enums';
import type { PersonalEntity, PersonalIntent } from './personal-intent';
import {
  SOURCE_LABEL,
  cleanText,
  mixedNote,
  renderExpenses,
  renderFarms,
  renderFields,
  renderNotifications,
  renderSeasons,
  type AccountSource,
  type FieldFact,
  type SeasonFact,
} from './personal-answers';
import { buildRedactedContext, type RedactedContext } from './redacted-context';
import type { AssistantLanguage } from './providers/agriculture-assistant.provider';

export interface PersonalAnswer {
  content: string;
  sources: AccountSource[];
}

export interface AssistantBriefing {
  unreadTotal: number;
  byCategory: Array<{ category: string; count: number }>;
  top: Array<{ category: string; title: string; createdAt: string }>;
}

interface FieldRowLike {
  name: string;
  currentCropCycle: {
    cropId?: string;
    status?: string;
    sowingDate?: string | Date | null;
  } | null;
}

const MAX_FARMS = 20;
const NOTIFICATION_FILTER: Record<string, NotificationCategory | undefined> = {
  weather: NotificationCategory.Weather,
  outbreak: NotificationCategory.Outbreak,
  task: NotificationCategory.Task,
  satellite: NotificationCategory.Satellite,
};

const dateOnly = (value: string | Date | null | undefined): string | null =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? value.slice(0, 10)
      : null;

/**
 * Read-only account facts for the assistant. Every query goes through an existing owner-scoped
 * service and takes the authenticated user id; nothing here writes, marks notifications read, or
 * logs names, titles or amounts. Satellite scan status is intentionally not offered: the satellite
 * service is not exported for reuse and the brief allows it only when such a method already exists.
 */
@Injectable()
export class PersonalContextService {
  constructor(
    private readonly farms: FarmManagementService,
    private readonly ledger: FarmLedgerService,
    private readonly notifications: NotificationService,
  ) {}

  private async inventory(userId: string): Promise<{
    farms: Array<{ name: string; fieldCount: number }>;
    fields: FieldFact[];
    seasons: SeasonFact[];
  }> {
    const [farmRows, crops] = await Promise.all([
      this.farms.listFarms(userId),
      this.farms.listCrops() as Promise<Array<{ id: string; name: string }>>,
    ]);
    const cropName = new Map(crops.map((c) => [c.id, c.name]));
    const farms: Array<{ name: string; fieldCount: number }> = [];
    const fields: FieldFact[] = [];
    const seasons: SeasonFact[] = [];
    for (const farm of farmRows.slice(0, MAX_FARMS)) {
      const rows = (await this.farms.listFields(userId, farm.id)) as unknown as FieldRowLike[];
      farms.push({ name: farm.name, fieldCount: rows.length });
      for (const row of rows) {
        const cycle = row.currentCropCycle;
        const crop = cycle?.cropId ? (cropName.get(cycle.cropId) ?? null) : null;
        fields.push({ farm: farm.name, name: row.name, crop });
        if (cycle && crop)
          seasons.push({
            farm: farm.name,
            field: row.name,
            crop,
            status: String(cycle.status ?? ''),
            sowingDate: dateOnly(cycle.sowingDate),
          });
      }
    }
    return { farms, fields, seasons };
  }

  async answer(
    userId: string,
    intent: PersonalIntent,
    language: AssistantLanguage,
  ): Promise<PersonalAnswer> {
    switch (intent.type) {
      case 'FARMS': {
        const { farms } = await this.inventory(userId);
        return {
          content: renderFarms(language, farms),
          sources: [{ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.farms }],
        };
      }
      case 'FIELDS': {
        const { fields } = await this.inventory(userId);
        return {
          content: renderFields(language, fields),
          sources: [{ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.fields }],
        };
      }
      case 'SEASONS': {
        const { seasons } = await this.inventory(userId);
        return {
          content: renderSeasons(language, seasons),
          sources: [{ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.seasons }],
        };
      }
      case 'EXPENSES': {
        const period = intent.period === 'other' ? 'all' : intent.period;
        const [summary, latest] = await Promise.all([
          this.ledger.summarize(userId, period),
          intent.shape === 'latest' ? this.ledger.latest(userId, 5) : Promise.resolve([]),
        ]);
        return {
          content: renderExpenses(language, intent.period, intent.shape, {
            ...summary,
            latest,
          }),
          sources: [{ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.expenses }],
        };
      }
      case 'NOTIFICATIONS': {
        const digest = await this.notifications.unreadDigest(userId, {
          category: NOTIFICATION_FILTER[intent.filter],
          titles: 3,
        });
        // The market filter has no notification category: nothing can match, so it is truly empty.
        const empty = intent.filter === 'market';
        return {
          content: renderNotifications(
            language,
            intent.filter,
            empty
              ? { unreadTotal: 0, byCategory: [], titles: [] }
              : {
                  unreadTotal: digest.unreadTotal,
                  byCategory: digest.byCategory,
                  titles: digest.top.map((t) => t.title),
                },
          ),
          sources: [{ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.notifications }],
        };
      }
    }
  }

  /**
   * Fake-provider answer to an advice question about the farmer's own farm/field/crop/alerts:
   * the relevant deterministic facts plus a note that advice needs approved knowledge.
   */
  async factsWithNote(
    userId: string,
    entities: PersonalEntity[],
    language: AssistantLanguage,
  ): Promise<PersonalAnswer> {
    const parts: string[] = [];
    const sources: AccountSource[] = [];
    if (entities.some((e) => e === 'FARMS' || e === 'FIELDS' || e === 'SEASONS')) {
      const inv = await this.inventory(userId);
      if (entities.includes('SEASONS')) {
        parts.push(renderSeasons(language, inv.seasons));
        sources.push({ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.seasons });
      } else if (entities.includes('FIELDS')) {
        parts.push(renderFields(language, inv.fields));
        sources.push({ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.fields });
      } else {
        parts.push(renderFarms(language, inv.farms));
        sources.push({ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.farms });
      }
    }
    if (entities.includes('NOTIFICATIONS')) {
      const digest = await this.notifications.unreadDigest(userId, { titles: 3 });
      parts.push(
        renderNotifications(language, 'all', {
          unreadTotal: digest.unreadTotal,
          byCategory: digest.byCategory,
          titles: digest.top.map((t) => t.title),
        }),
      );
      sources.push({ type: 'ACCOUNT_DATA', label: SOURCE_LABEL.notifications });
    }
    parts.push(mixedNote(language));
    return { content: parts.join('\n\n'), sources };
  }

  /** Owner-scoped unread warning digest for GET /assistant/briefing. Read-only. */
  async briefing(userId: string): Promise<AssistantBriefing> {
    const digest = await this.notifications.unreadDigest(userId, { titles: 3 });
    return {
      unreadTotal: digest.unreadTotal,
      byCategory: digest.byCategory,
      top: digest.top.map((t) => ({
        category: t.category,
        title: cleanText(t.title, 160),
        createdAt: new Date(t.createdAt).toISOString(),
      })),
    };
  }

  /**
   * Names and titles only, for a REAL external model. Deliberately never calls the ledger and
   * never reads ids, coordinates, phone or email.
   */
  async redactedContext(userId: string): Promise<RedactedContext> {
    const [inv, digest] = await Promise.all([
      this.inventory(userId),
      this.notifications.unreadDigest(userId, { titles: 5 }),
    ]);
    return buildRedactedContext({
      farms: inv.farms,
      fields: inv.fields,
      notifications: digest.top,
    });
  }
}
