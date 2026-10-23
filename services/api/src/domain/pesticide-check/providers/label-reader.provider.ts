import type { ExtractedLabelFields } from '../label-fields';

export const LABEL_READER_PROVIDER = Symbol('LABEL_READER_PROVIDER');

export interface LabelReadInput {
  /** Short-lived signed URL of the uploaded label photo. */
  imageUrl: string;
  languageHint?: 'en' | 'ur';
}

export interface LabelReadResult {
  rawText: string;
  fields: ExtractedLabelFields;
  /** Per-field confidence 0..1; `overall` is the mean OCR confidence when the reader knows it. */
  confidence: Record<string, number>;
  provider: string;
  model: string;
}

export interface LabelReaderProvider {
  /** True when the photo leaves our infrastructure (a hosted vision model). */
  readonly external: boolean;
  read(input: LabelReadInput): Promise<LabelReadResult>;
}
