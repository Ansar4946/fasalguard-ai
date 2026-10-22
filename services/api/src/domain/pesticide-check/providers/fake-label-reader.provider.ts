import { Injectable } from '@nestjs/common';
import { extractLabelFields } from '../label-fields';
import type { LabelReaderProvider, LabelReadInput, LabelReadResult } from './label-reader.provider';

/** Deterministic text used by tests and local demos. An imageUrl containing "unreadable" yields no text. */
export const FAKE_LABEL_TEXT = [
  'DEMO Imidacloprid 20% SL',
  'Insecticide',
  'Active Ingredient: Imidacloprid 20% SL',
  'Manufactured by: Demo Agro Chemicals Pvt Ltd',
  'Reg. No. 1234/2020',
  'Batch No: B2407A',
  'Mfg: 03/2026   Exp: 03/2028',
  'Net contents 250 ml',
].join('\n');

@Injectable()
export class FakeLabelReaderProvider implements LabelReaderProvider {
  readonly external = false;

  read(input: LabelReadInput): Promise<LabelReadResult> {
    let text = FAKE_LABEL_TEXT;
    if (input.imageUrl.includes('unreadable')) text = 'xx';
    else if (input.imageUrl.includes('banned'))
      text = FAKE_LABEL_TEXT.replace(/Imidacloprid/g, 'Endosulfan');
    else if (input.imageUrl.includes('expired'))
      text = FAKE_LABEL_TEXT.replace('03/2028', '01/2020');
    const fields = extractLabelFields(text);
    return Promise.resolve({
      rawText: text,
      fields,
      confidence: Object.fromEntries(Object.keys(fields).map((k) => [k, 0.9])),
      provider: 'fake',
      model: 'fake-label-reader',
    });
  }
}
