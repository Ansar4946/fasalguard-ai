/** Crop detection for approved-knowledge retrieval (pure; no database access). */

export type CropKey = 'wheat' | 'rice' | 'cotton' | 'maize' | 'sugarcane';

/** Single-token, lower-case spellings (English, Roman Urdu and Urdu) that name each crop. */
export const CROP_ALIASES: Readonly<Record<CropKey, readonly string[]>> = {
  wheat: ['wheat', 'gandum', 'gehun', 'گندم'],
  rice: ['rice', 'paddy', 'chawal', 'dhaan', 'dhan', 'چاول', 'دھان', 'دهان', 'چانول'],
  cotton: ['cotton', 'kapas', 'kapaas', 'کپاس'],
  maize: ['maize', 'corn', 'makai', 'مکئی', 'مکئ', 'مکی', 'مکّئی'],
  sugarcane: ['sugarcane', 'sugar-cane', 'ganna', 'گنا', 'گنے', 'کماد'],
};

const CROP_KEYS = Object.keys(CROP_ALIASES) as CropKey[];
const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

/** Crops named in the question, in order of first mention. English plurals and "sugar cane" are accepted. */
export function detectCrops(question: string): CropKey[] {
  const lower = question.toLowerCase().replace(/sugar[\s-]+cane/g, 'sugarcane');
  const tokens = lower.match(TOKEN) ?? [];
  const found: CropKey[] = [];
  for (const raw of tokens) {
    const token = raw.endsWith('s') && /^[a-z]+$/.test(raw) ? raw.slice(0, -1) : raw;
    for (const crop of CROP_KEYS) {
      const aliases = CROP_ALIASES[crop];
      if ((aliases.includes(raw) || aliases.includes(token)) && !found.includes(crop))
        found.push(crop);
    }
  }
  return found;
}

/** Aliases (single tokens, safe for tsquery) for the given crops. */
export function aliasesOf(crops: readonly CropKey[]): string[] {
  return crops.flatMap((c) => CROP_ALIASES[c].filter((a) => /^[\p{L}\p{M}\p{N}]+$/u.test(a)));
}

/** Aliases of every crop NOT in `crops`. */
export function otherCropAliases(crops: readonly CropKey[]): string[] {
  return aliasesOf(CROP_KEYS.filter((c) => !crops.includes(c)));
}
