export interface AllowedQuestion {
  key: string;
  text: string;
  tags: string[];
}
export const ALLOWED_QUESTION_LIBRARY: readonly AllowedQuestion[] = Object.freeze([
  { key: 'SYMPTOM_ONSET', text: 'When did the symptoms begin?', tags: ['general'] },
  { key: 'SPREADING', text: 'Is the problem spreading?', tags: ['general'] },
  { key: 'LEAF_AGE', text: 'Are younger or older leaves affected?', tags: ['leaf'] },
  { key: 'INSECTS_VISIBLE', text: 'Are insects visible?', tags: ['pest', 'leaf'] },
  { key: 'RECENT_PESTICIDE', text: 'Was pesticide recently applied?', tags: ['general'] },
  {
    key: 'RECENT_FERTILIZER',
    text: 'Was fertilizer recently applied?',
    tags: ['nutrient', 'general'],
  },
  { key: 'HEAVY_RAIN', text: 'Has heavy rain occurred recently?', tags: ['weather'] },
  {
    key: 'FIELD_PERCENT',
    text: 'What percentage of the field appears affected?',
    tags: ['general', 'satellite'],
  },
]);
