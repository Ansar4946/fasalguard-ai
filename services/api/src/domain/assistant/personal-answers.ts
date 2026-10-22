/* eslint-disable no-control-regex -- the character classes below list control/joiner characters on purpose */
/**
 * Deterministic, localised answer templates for account-data questions (F10 personal context).
 * Everything here is pure: facts in, text out. Amounts are formatted from integer paisa with
 * BigInt arithmetic only. The Urdu and Hindi template wording is UNVERIFIED by a native speaker.
 */
import type { AssistantLanguage } from './providers/agriculture-assistant.provider';
import type { ExpensePeriod, NotificationFilter } from './personal-intent';

/** Tag shown beside account answers; distinct from approved-knowledge citations. */
export interface AccountSource {
  type: 'ACCOUNT_DATA';
  label: string;
}

export const SOURCE_LABEL = {
  farms: 'Your farms',
  fields: 'Your fields',
  seasons: 'Your crop seasons',
  expenses: 'Your confirmed expenses',
  notifications: 'Your notifications',
} as const;

/** Untrusted display text: remove control/format characters, collapse spaces, cap the length. */

const UNSAFE_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

export function cleanText(value: unknown, max = 80): string {
  const text = typeof value === 'string' ? value : '';
  return text.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "PKR 1,234.50" from integer paisa (string, bigint or safe integer). No floating point. */
export function formatPkr(minor: string | bigint | number): string {
  let value: bigint;
  try {
    value =
      typeof minor === 'bigint'
        ? minor
        : typeof minor === 'number'
          ? Number.isSafeInteger(minor)
            ? BigInt(minor)
            : -1n
          : /^\d+$/.test(minor)
            ? BigInt(minor)
            : -1n;
  } catch {
    value = -1n;
  }
  if (value < 0n) return 'PKR —';
  const major = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `PKR ${major}.${(value % 100n).toString().padStart(2, '0')}`;
}

export interface FarmFact {
  name: string;
  fieldCount: number;
}
export interface FieldFact {
  farm: string;
  name: string;
  crop: string | null;
}
export interface SeasonFact {
  farm: string;
  field: string;
  crop: string;
  status: string;
  sowingDate: string | null;
}
export interface CategoryTotal {
  category: string;
  totalMinor: string;
  count: number;
}
export interface LedgerFact {
  occurredOn: string;
  category: string;
  amountMinor: string;
  farm: string;
}
export interface ExpenseFacts {
  totalMinor: string;
  count: number;
  byCategory: CategoryTotal[];
  latest: LedgerFact[];
}
export interface NotificationFacts {
  unreadTotal: number;
  byCategory: Array<{ category: string; count: number }>;
  titles: string[];
}

interface Pack {
  none: { farms: string; fields: string; seasons: string };
  farms: (n: number, list: string) => string;
  farmItem: (name: string, fields: number) => string;
  fields: (n: number, list: string) => string;
  fieldItem: (name: string, farm: string, crop: string | null) => string;
  seasons: (list: string) => string;
  seasonItem: (
    crop: string,
    field: string,
    farm: string,
    status: string,
    sown: string | null,
  ) => string;
  status: Record<string, string>;
  period: Record<ExpensePeriod, string>;
  expTotal: (period: string, amount: string, n: number) => string;
  expEmpty: (period: string) => string;
  expCategory: (period: string, list: string, total: string) => string;
  expLatest: (list: string) => string;
  expLatestItem: (date: string, category: string, amount: string, farm: string) => string;
  expOtherPeriod: string;
  category: Record<string, string>;
  notifEmpty: (filter: string) => string;
  notif: (n: number, filter: string, kinds: string, titles: string) => string;
  filter: Record<NotificationFilter, string>;
  notifKind: Record<string, string>;
  critical: string;
  more: (n: number) => string;
  sep: string;
  mixedNote: string;
}

const EN: Pack = {
  none: {
    farms: 'You have no farms saved yet. Add one on the Farms page.',
    fields: 'You have no fields saved yet.',
    seasons: 'You have no active or planned crop seasons.',
  },
  farms: (n, list) => `You have ${n} ${n === 1 ? 'farm' : 'farms'}: ${list}.`,
  farmItem: (name, fields) => `${name} (${fields} ${fields === 1 ? 'field' : 'fields'})`,
  fields: (n, list) => `You have ${n} ${n === 1 ? 'field' : 'fields'}: ${list}.`,
  fieldItem: (name, farm, crop) => `${name} on farm ${farm}${crop ? `, crop ${crop}` : ''}`,
  seasons: (list) => `Your crop seasons: ${list}.`,
  seasonItem: (crop, field, farm, status, sown) =>
    `${crop} on ${field} (${farm}), ${status}${sown ? `, sown ${sown}` : ''}`,
  status: { active: 'active', planned: 'planned' },
  period: {
    week: 'in the last 7 days',
    month: 'this month',
    season: 'in your current crop seasons',
    all: 'in total',
    other: 'in total',
  },
  expTotal: (p, a, n) =>
    `Your confirmed expenses ${p}: ${a} in ${n} ${n === 1 ? 'entry' : 'entries'}.`,
  expEmpty: (p) => `You have no confirmed expenses ${p}.`,
  expCategory: (p, list, t) => `Your confirmed expenses ${p} by category: ${list}. Total ${t}.`,
  expLatest: (list) => `Your latest confirmed expenses: ${list}.`,
  expLatestItem: (d, c, a, f) => `${d} ${c} ${a} (${f})`,
  expOtherPeriod:
    'I can summarise the last 7 days, this month, this season or all entries, so I am showing all entries. ',
  category: {
    SEED: 'Seed',
    FERTILIZER: 'Fertilizer',
    PESTICIDE: 'Pesticide',
    LABOUR: 'Labour',
    IRRIGATION: 'Irrigation',
    EQUIPMENT: 'Equipment',
    TRANSPORT: 'Transport',
    OTHER: 'Other',
  },
  notifEmpty: (f) => `You have no unread ${f}notifications.`,
  notif: (n, f, k, t) =>
    `You have ${n} unread ${f}${n === 1 ? 'notification' : 'notifications'}. By type: ${k}. Latest: ${t}.`,
  filter: {
    all: '',
    critical: '',
    weather: 'weather ',
    outbreak: 'outbreak ',
    market: 'market ',
    task: 'task ',
    satellite: 'satellite ',
  },
  notifKind: {
    SATELLITE: 'Satellite',
    WEATHER: 'Weather',
    DIAGNOSIS: 'Diagnosis',
    EXPERT: 'Expert',
    OUTBREAK: 'Outbreak',
    TASK: 'Task',
    SYSTEM: 'System',
  },
  critical:
    'Notifications do not have a separate critical level, so all unread notifications are shown. ',
  more: (n) => `and ${n} more`,
  sep: '; ',
  mixedNote:
    'I can share these facts from your account, but advice on what to do needs approved agriculture guidance, which is not available to me for this question. Please ask an agriculture expert.',
};

// UNVERIFIED by a native Urdu speaker.
const UR: Pack = {
  none: {
    farms: 'آپ کے اکاؤنٹ میں ابھی کوئی فارم محفوظ نہیں ہے۔',
    fields: 'آپ کے اکاؤنٹ میں ابھی کوئی کھیت محفوظ نہیں ہے۔',
    seasons: 'آپ کا کوئی فعال یا منصوبہ بند فصل کا سیزن نہیں ہے۔',
  },
  farms: (n, list) => `آپ کے ${n} فارم ہیں: ${list}۔`,
  farmItem: (name, fields) => `${name} (${fields} کھیت)`,
  fields: (n, list) => `آپ کے ${n} کھیت ہیں: ${list}۔`,
  fieldItem: (name, farm, crop) => `${name}، فارم ${farm}${crop ? `، فصل ${crop}` : ''}`,
  seasons: (list) => `آپ کے فصل کے سیزن: ${list}۔`,
  seasonItem: (crop, field, farm, status, sown) =>
    `${crop}، کھیت ${field} (${farm})، ${status}${sown ? `، بوائی ${sown}` : ''}`,
  status: { active: 'فعال', planned: 'منصوبہ بند' },
  period: {
    week: 'پچھلے 7 دنوں میں',
    month: 'اس مہینے',
    season: 'موجودہ فصل کے سیزن میں',
    all: 'کل ملا کر',
    other: 'کل ملا کر',
  },
  expTotal: (p, a, n) => `آپ کے تصدیق شدہ اخراجات ${p}: ${a} (${n} اندراجات)۔`,
  expEmpty: (p) => `${p} کوئی تصدیق شدہ خرچ درج نہیں ہے۔`,
  expCategory: (p, list, t) => `زمرے کے لحاظ سے تصدیق شدہ اخراجات (${p}): ${list}۔ کل ${t}۔`,
  expLatest: (list) => `آپ کے تازہ ترین تصدیق شدہ اخراجات: ${list}۔`,
  expLatestItem: (d, c, a, f) => `${d} ${c} ${a} (${f})`,
  expOtherPeriod:
    'میں پچھلے 7 دن، اس مہینے، اس سیزن یا تمام اندراجات کا خلاصہ دے سکتا ہوں، اس لیے تمام اندراجات دکھا رہا ہوں۔ ',
  category: {
    SEED: 'بیج',
    FERTILIZER: 'کھاد',
    PESTICIDE: 'کیڑے مار دوا',
    LABOUR: 'مزدوری',
    IRRIGATION: 'آبپاشی',
    EQUIPMENT: 'آلات',
    TRANSPORT: 'نقل و حمل',
    OTHER: 'دیگر',
  },
  notifEmpty: (f) => `آپ کی کوئی نہ پڑھی ہوئی ${f}اطلاع نہیں ہے۔`,
  notif: (n, f, k, t) => `آپ کی ${n} نہ پڑھی ہوئی ${f}اطلاعات ہیں۔ اقسام: ${k}۔ تازہ ترین: ${t}۔`,
  filter: {
    all: '',
    critical: '',
    weather: 'موسم کی ',
    outbreak: 'وبا کی ',
    market: 'منڈی کی ',
    task: 'کام کی ',
    satellite: 'سیٹلائٹ کی ',
  },
  notifKind: {
    SATELLITE: 'سیٹلائٹ',
    WEATHER: 'موسم',
    DIAGNOSIS: 'تشخیص',
    EXPERT: 'ماہر',
    OUTBREAK: 'وبا',
    TASK: 'کام',
    SYSTEM: 'سسٹم',
  },
  critical:
    'اطلاعات میں الگ سے "سنگین" درجہ نہیں ہے، اس لیے تمام نہ پڑھی ہوئی اطلاعات دکھائی جا رہی ہیں۔ ',
  more: (n) => `اور ${n} مزید`,
  sep: '؛ ',
  mixedNote:
    'میں آپ کے اکاؤنٹ کی یہ معلومات بتا سکتا ہوں، مگر کیا کرنا چاہیے اس کے لیے منظور شدہ زرعی رہنمائی درکار ہے جو اس سوال کے لیے میرے پاس نہیں ہے۔ براہِ کرم زرعی ماہر سے رجوع کریں۔',
};

// UNVERIFIED by a native Hindi speaker.
const HI: Pack = {
  none: {
    farms: 'आपके खाते में अभी कोई फार्म सहेजा नहीं गया है।',
    fields: 'आपके खाते में अभी कोई खेत सहेजा नहीं गया है।',
    seasons: 'आपका कोई सक्रिय या प्रस्तावित फसल सीजन नहीं है।',
  },
  farms: (n, list) => `आपके ${n} फार्म हैं: ${list}।`,
  farmItem: (name, fields) => `${name} (${fields} खेत)`,
  fields: (n, list) => `आपके ${n} खेत हैं: ${list}।`,
  fieldItem: (name, farm, crop) => `${name}, फार्म ${farm}${crop ? `, फसल ${crop}` : ''}`,
  seasons: (list) => `आपके फसल सीजन: ${list}।`,
  seasonItem: (crop, field, farm, status, sown) =>
    `${crop}, खेत ${field} (${farm}), ${status}${sown ? `, बुवाई ${sown}` : ''}`,
  status: { active: 'सक्रिय', planned: 'प्रस्तावित' },
  period: {
    week: 'पिछले 7 दिनों में',
    month: 'इस महीने',
    season: 'मौजूदा फसल सीजन में',
    all: 'कुल मिलाकर',
    other: 'कुल मिलाकर',
  },
  expTotal: (p, a, n) => `आपके पुष्ट किए गए खर्च ${p}: ${a} (${n} प्रविष्टियां)।`,
  expEmpty: (p) => `${p} कोई पुष्ट किया गया खर्च दर्ज नहीं है।`,
  expCategory: (p, list, t) => `श्रेणी के अनुसार पुष्ट खर्च (${p}): ${list}। कुल ${t}।`,
  expLatest: (list) => `आपके हाल के पुष्ट खर्च: ${list}।`,
  expLatestItem: (d, c, a, f) => `${d} ${c} ${a} (${f})`,
  expOtherPeriod:
    'मैं पिछले 7 दिन, इस महीने, इस सीजन या सभी प्रविष्टियों का सार दे सकता हूं, इसलिए सभी प्रविष्टियां दिखा रहा हूं। ',
  category: {
    SEED: 'बीज',
    FERTILIZER: 'उर्वरक',
    PESTICIDE: 'कीटनाशक',
    LABOUR: 'मजदूरी',
    IRRIGATION: 'सिंचाई',
    EQUIPMENT: 'उपकरण',
    TRANSPORT: 'परिवहन',
    OTHER: 'अन्य',
  },
  notifEmpty: (f) => `आपकी कोई अपठित ${f}सूचना नहीं है।`,
  notif: (n, f, k, t) => `आपकी ${n} अपठित ${f}सूचनाएं हैं। प्रकार: ${k}। नवीनतम: ${t}।`,
  filter: {
    all: '',
    critical: '',
    weather: 'मौसम की ',
    outbreak: 'प्रकोप की ',
    market: 'मंडी की ',
    task: 'कार्य की ',
    satellite: 'सैटेलाइट की ',
  },
  notifKind: {
    SATELLITE: 'सैटेलाइट',
    WEATHER: 'मौसम',
    DIAGNOSIS: 'निदान',
    EXPERT: 'विशेषज्ञ',
    OUTBREAK: 'प्रकोप',
    TASK: 'कार्य',
    SYSTEM: 'सिस्टम',
  },
  critical: 'सूचनाओं में अलग से "गंभीर" स्तर नहीं है, इसलिए सभी अपठित सूचनाएं दिखाई जा रही हैं। ',
  more: (n) => `और ${n} अधिक`,
  sep: '; ',
  mixedNote:
    'मैं आपके खाते की ये जानकारी बता सकता हूं, लेकिन क्या करना चाहिए इसके लिए स्वीकृत कृषि मार्गदर्शन चाहिए, जो इस प्रश्न के लिए मेरे पास नहीं है। कृपया किसी कृषि विशेषज्ञ से पूछें।',
};

const PACKS: Record<AssistantLanguage, Pack> = { en: EN, ur: UR, hi: HI };
const MAX_ITEMS = 10;

function join(pack: Pack, items: string[]): string {
  const shown = items.slice(0, MAX_ITEMS).join(pack.sep);
  return items.length > MAX_ITEMS ? `${shown} ${pack.more(items.length - MAX_ITEMS)}` : shown;
}

export const mixedNote = (language: AssistantLanguage): string => PACKS[language].mixedNote;

export function renderFarms(language: AssistantLanguage, farms: FarmFact[]): string {
  const p = PACKS[language];
  if (!farms.length) return p.none.farms;
  return p.farms(
    farms.length,
    join(
      p,
      farms.map((f) => p.farmItem(cleanText(f.name), f.fieldCount)),
    ),
  );
}

export function renderFields(language: AssistantLanguage, fields: FieldFact[]): string {
  const p = PACKS[language];
  if (!fields.length) return p.none.fields;
  return p.fields(
    fields.length,
    join(
      p,
      fields.map((f) =>
        p.fieldItem(cleanText(f.name), cleanText(f.farm), f.crop ? cleanText(f.crop) : null),
      ),
    ),
  );
}

export function renderSeasons(language: AssistantLanguage, seasons: SeasonFact[]): string {
  const p = PACKS[language];
  if (!seasons.length) return p.none.seasons;
  return p.seasons(
    join(
      p,
      seasons.map((s) =>
        p.seasonItem(
          cleanText(s.crop),
          cleanText(s.field),
          cleanText(s.farm),
          p.status[s.status] ?? cleanText(s.status, 20),
          s.sowingDate && /^\d{4}-\d{2}-\d{2}/.test(s.sowingDate)
            ? s.sowingDate.slice(0, 10)
            : null,
        ),
      ),
    ),
  );
}

export function renderExpenses(
  language: AssistantLanguage,
  period: ExpensePeriod,
  shape: 'total' | 'category' | 'latest',
  facts: ExpenseFacts,
): string {
  const p = PACKS[language];
  const label = p.period[period];
  const prefix = period === 'other' ? p.expOtherPeriod : '';
  if (facts.count === 0) return prefix + p.expEmpty(label);
  if (shape === 'category')
    return (
      prefix +
      p.expCategory(
        label,
        join(
          p,
          facts.byCategory.map(
            (c) =>
              `${p.category[c.category] ?? cleanText(c.category, 24)} ${formatPkr(c.totalMinor)}`,
          ),
        ),
        formatPkr(facts.totalMinor),
      )
    );
  if (shape === 'latest')
    return (
      prefix +
      p.expLatest(
        join(
          p,
          facts.latest.map((e) =>
            p.expLatestItem(
              e.occurredOn,
              p.category[e.category] ?? cleanText(e.category, 24),
              formatPkr(e.amountMinor),
              cleanText(e.farm),
            ),
          ),
        ),
      )
    );
  return prefix + p.expTotal(label, formatPkr(facts.totalMinor), facts.count);
}

export function renderNotifications(
  language: AssistantLanguage,
  filter: NotificationFilter,
  facts: NotificationFacts,
): string {
  const p = PACKS[language];
  const note = filter === 'critical' ? p.critical : '';
  const label = p.filter[filter];
  if (facts.unreadTotal === 0) return note + p.notifEmpty(label);
  const kinds = facts.byCategory
    .map((c) => `${p.notifKind[c.category] ?? cleanText(c.category, 20)} ${c.count}`)
    .join(p.sep);
  const titles = facts.titles.map((t) => `"${cleanText(t, 120)}"`).join(p.sep);
  return note + p.notif(facts.unreadTotal, label, kinds, titles);
}
