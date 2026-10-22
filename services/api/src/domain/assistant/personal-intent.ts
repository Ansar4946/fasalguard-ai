/* eslint-disable no-misleading-character-class -- the character classes below list control/joiner characters on purpose */
/**
 * Rule-based detection of questions about the signed-in farmer's own account data (F10 personal
 * context). Pure and deterministic: no model, no I/O. Covers English, Urdu (script), Roman Urdu and
 * Hindi keywords. Urdu/Hindi/Roman Urdu word lists are UNVERIFIED by a native speaker.
 *
 * A question is "direct" (answered from owner-scoped queries) only when it names an account noun
 * (farms, fields, crops, expenses, notifications), is phrased as a personal/list question, and is
 * NOT an advice question. An advice question that mentions account nouns is "mixed": it stays on
 * the grounded knowledge flow.
 */

export type ExpensePeriod = 'week' | 'month' | 'season' | 'all' | 'other';
export type ExpenseShape = 'total' | 'category' | 'latest';
export type NotificationFilter =
  'all' | 'critical' | 'weather' | 'outbreak' | 'market' | 'task' | 'satellite';
export type PersonalEntity = 'FARMS' | 'FIELDS' | 'SEASONS' | 'EXPENSES' | 'NOTIFICATIONS';

export type PersonalIntent =
  | { type: 'FARMS' }
  | { type: 'FIELDS' }
  | { type: 'SEASONS' }
  | { type: 'EXPENSES'; period: ExpensePeriod; shape: ExpenseShape }
  | { type: 'NOTIFICATIONS'; filter: NotificationFilter };

export type PersonalDetection =
  { mode: 'direct'; intent: PersonalIntent } | { mode: 'mixed'; entities: PersonalEntity[] };

/** Same normalisation for input and lexicon so variant spellings compare equal. */
export function normalizeText(text: string): string {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      // Arabic-script diacritics, Devanagari nukta, joiners and direction marks.
      .replace(/[\u064B-\u065F\u0670\u093C\u200C\u200D\u200E\u200F]/g, '')
      .replace(/[\u064A\u0649]/g, '\u06CC')
      .replace(/\u0643/g, '\u06A9')
      .replace(/[\u06C3\u0647\u06C1]/g, '\u06C1')
      .replace(/\u06BE/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const tokensOf = (text: string): string[] =>
  normalizeText(text)
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);

const words = (list: string): ReadonlySet<string> =>
  new Set(
    list
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => normalizeText(w)),
  );

const FARM = words('farm farms فارم فارمز فارمیں فارموں फार्म फार्मों फार्मो');
const FIELD = words(
  'field fields plot plots zameen zamin khet khait khaiton khetoon ' +
    'کھیت کیت کھیتوں کھیتیں زمین زمینیں زمینوں खेत खेतों खेतो जमीन',
);
const SEASON = words(
  'crop crops season seasons fasal fasalen fasalon ' + 'فصل فصلیں فصلوں سیزن सीजन फसल फसलें फसलों',
);
const EXPENSE = words(
  'expense expenses spend spent spending kharch kharcha kharche kharchay kharchey ledger ' +
    'خرچ خرچہ خرچے اخراجات خرچوں खर्च खर्चा खर्चे व्यय',
);
const NOTIFICATION = words(
  'notification notifications alert alerts warning warnings notice notices ittila ittilaat ittelaat khabardar ' +
    'اطلاع اطلاعات الرٹ الرٹس انتباہ وارننگ وارننگز نوٹیفکیشن نوٹیفکیشنز خبردار ' +
    'सूचना सूचनाएं सूचनाएँ चेतावनी चेतावनियां चेतावनियाँ अलर्ट नोटिफिकेशन',
);

const POSSESSIVE = words(
  'my mine our ours i mera meri mere hamara hamari hamare mujhe mujhay mujhko ' +
    'میرا میری میرے ہمارا ہماری ہمارے مجھے مجھ ' +
    'मेरा मेरी मेरे हमारा हमारी हमारे मुझे',
);
/** Past-tense markers that make "kitna kharch hua" a question about the farmer's own spending. */
const PERSONAL_PAST = words('hua hue kiya kia kiye ہوا ہوئے کیے کئے हुआ हुए किया');
const LIST_CUE = words(
  'which list show how many much what tell any there name names ' +
    'kitne kitna kitni kaun kon konse kaunse koi dikhao dikhayen batao batayen bataiye ' +
    'کون کونسے کونسی کتنے کتنا کتنی کوئی دکھائیں دکھاو بتائیں بتاو بتائیے فہرست ' +
    'कौन कौनसे कितने कितना कितनी कोई दिखाओ दिखाएं बताओ बताइए बताएं सूची',
);
const ADVICE = words(
  'should shall best treat treatment cure spray sprayed irrigate irrigating watering apply fertilize fertilise ' +
    'prevent protect kill why advice advise suggest recommend recommendation tips reduce increase improve ' +
    'safe dose dosage sow sowing save saving ' +
    'kaise kese kaisay chahiye karun karoon ilaj dawa mashwara behtar bachao bachaen ' +
    'کیسے چاہیے چاہئے علاج مشورہ بہتر بچاو سپرے دوا کیوں ' +
    'कैसे चाहिए इलाज सलाह बेहतर क्यों स्प्रे दवा',
);
const ADVICE_PHRASES = [
  'how to',
  'how do i',
  'how can i',
  'how should',
  'when to',
  'when should',
  'what should',
  'can i',
  'is it ok',
  'is it safe',
  'kya karun',
  'kya karon',
  'kab karun',
  'کیا کروں',
  'کب کروں',
  'क्या करूं',
  'क्या करूँ',
  'कब करें',
].map(normalizeText);

const WEEK = words('week weekly hafta hafte haftay haftey ہفتہ ہفتے सप्ताह हफ्ता हफ्ते हफ्तों');
const MONTH = words('month monthly mahina mahine maheena maheene مہینہ مہینے ماہ महीना महीने माह');
const SEASON_WORD = words('season seasons سیزن सीजन');
const PREVIOUS = words('last previous pichle pichla پچھلے پچھلا पिछले पिछला');
const LATEST = words(
  'latest recent newest recently aakhri akhri taza taaza آخری حالیہ تازہ नवीनतम आखिरी ताजा',
);
const CATEGORY = words(
  'category categories breakdown type types kisam qisam zimra زمرہ زمرے قسم اقسام श्रेणी प्रकार वर्ग',
);

const F_CRITICAL = words(
  'critical urgent serious severe khatarnak sangeen سنگین خطرناک ضروری गंभीर जरूरी',
);
const F_WEATHER = words('weather rain mausam barish موسم بارش मौसम बारिश');
const F_OUTBREAK = words('outbreak outbreaks wabaa waba وبا प्रकोप');
const F_MARKET = words('market price prices mandi bhav منڈی بازار قیمت मंडी बाजार भाव');
const F_TASK = words('task tasks kaam کام कार्य काम');
const F_SATELLITE = words('satellite سیٹلائٹ सैटेलाइट');

const has = (tokens: string[], list: ReadonlySet<string>): boolean =>
  tokens.some((t) => list.has(t));

function detectEntities(tokens: string[]): PersonalEntity[] {
  const found: PersonalEntity[] = [];
  if (has(tokens, EXPENSE)) found.push('EXPENSES');
  if (has(tokens, NOTIFICATION)) found.push('NOTIFICATIONS');
  if (has(tokens, SEASON)) found.push('SEASONS');
  if (has(tokens, FIELD)) found.push('FIELDS');
  if (has(tokens, FARM)) found.push('FARMS');
  return found;
}

const isPeriodWord = (t: string | undefined): boolean =>
  t !== undefined && (WEEK.has(t) || MONTH.has(t) || SEASON_WORD.has(t));

function expensePeriod(tokens: string[]): ExpensePeriod {
  // "last month" / "previous week": a period this assistant does not summarise.
  if (tokens.some((t, i) => PREVIOUS.has(t) && isPeriodWord(tokens[i + 1]))) return 'other';
  if (tokens.some((t) => WEEK.has(t))) return 'week';
  if (tokens.some((t) => MONTH.has(t))) return 'month';
  if (tokens.some((t) => SEASON_WORD.has(t) || SEASON.has(t))) return 'season';
  return 'all';
}

function expenseShape(tokens: string[]): ExpenseShape {
  if (has(tokens, CATEGORY)) return 'category';
  const latest = tokens.some(
    (t, i) => LATEST.has(t) || (PREVIOUS.has(t) && !isPeriodWord(tokens[i + 1])),
  );
  return latest ? 'latest' : 'total';
}

function notificationFilter(tokens: string[]): NotificationFilter {
  if (has(tokens, F_CRITICAL)) return 'critical';
  if (has(tokens, F_OUTBREAK)) return 'outbreak';
  if (has(tokens, F_MARKET)) return 'market';
  if (has(tokens, F_SATELLITE)) return 'satellite';
  if (has(tokens, F_WEATHER)) return 'weather';
  if (has(tokens, F_TASK)) return 'task';
  return 'all';
}

/** Returns null when the text is not about the farmer's own account data. */
export function detectPersonalIntent(text: string): PersonalDetection | null {
  const normalized = normalizeText(text);
  const tokens = tokensOf(text);
  if (!tokens.length || tokens.length > 40) return null;
  const entities = detectEntities(tokens);
  if (!entities.length) return null;
  const padded = ` ${normalized} `;
  const advice =
    has(tokens, ADVICE) || ADVICE_PHRASES.some((phrase) => padded.includes(` ${phrase} `));
  const possessive = has(tokens, POSSESSIVE);

  if (advice) {
    // Advice about the farmer's own farm/field/crop/alerts stays on the knowledge flow. A question
    // that only mentions expenses is never "mixed": finance is never sent to a model.
    const mixed = entities.filter((e) => e !== 'EXPENSES');
    return mixed.length && (possessive || mixed.includes('NOTIFICATIONS'))
      ? { mode: 'mixed', entities: mixed }
      : null;
  }

  const cue = has(tokens, LIST_CUE);
  const primary = entities[0]!;
  switch (primary) {
    case 'EXPENSES': {
      const period = expensePeriod(tokens);
      const personal = possessive || has(tokens, PERSONAL_PAST) || (cue && period !== 'all');
      return personal
        ? { mode: 'direct', intent: { type: 'EXPENSES', period, shape: expenseShape(tokens) } }
        : null;
    }
    case 'NOTIFICATIONS':
      return possessive || cue || has(tokens, PERSONAL_PAST)
        ? { mode: 'direct', intent: { type: 'NOTIFICATIONS', filter: notificationFilter(tokens) } }
        : null;
    default:
      // Farm/field/crop lists need "my"/"do I have": "which crops grow in sandy soil" is agronomy.
      return possessive ? { mode: 'direct', intent: { type: primary } } : null;
  }
}

/** Reply language for account answers: the script of the question wins over the selector. */
export function scriptLanguage(text: string): 'ur' | 'hi' | null {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  return null;
}
