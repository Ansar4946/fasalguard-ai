import type { LabelReaderProvider } from './label-reader.provider';

export type LabelReaderChoice = 'tesseract' | 'openai-compatible' | 'fake';

export function normalizeLabelReaderChoice(value: string | undefined): LabelReaderChoice {
  return value === 'openai-compatible' || value === 'fake' ? value : 'tesseract';
}

/** Pure selection by LABEL_READER_PROVIDER; unknown values fall back to the local Tesseract reader. */
export function selectLabelReader(
  choice: string | undefined,
  readers: {
    tesseract: LabelReaderProvider;
    openaiCompatible: LabelReaderProvider;
    fake: LabelReaderProvider;
  },
): LabelReaderProvider {
  const normalized = normalizeLabelReaderChoice(choice);
  return normalized === 'fake'
    ? readers.fake
    : normalized === 'openai-compatible'
      ? readers.openaiCompatible
      : readers.tesseract;
}
