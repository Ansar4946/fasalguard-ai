/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Worker } from 'tesseract.js';
import { extractLabelFields, LABEL_FIELD_KEYS } from '../label-fields';
import { downloadLabelImage, preprocessForOcr, rotateImage, type FetchLike } from './label-image';
import type { LabelReaderProvider, LabelReadInput, LabelReadResult } from './label-reader.provider';

/** Directory with the bundled tessdata_fast language files (never downloaded at runtime). */
export const DEFAULT_TESSDATA_DIR = join(__dirname, '..', '..', '..', '..', 'assets', 'tessdata');
export const OCR_TIMEOUT_MS = 25_000;
/** Below this mean confidence the photo is retried rotated 180/90/270 degrees and the best pass is kept. */
export const OCR_RETRY_BELOW = 0.6;
/** Stop trying more rotations once this much of the job budget is used. */
export const OCR_RETRY_BUDGET_MS = 12_000;

interface OcrWord {
  text: string;
  confidence: number;
}

/**
 * Local OCR with tesseract.js. One lazily created worker, one job at a time (an in-process queue),
 * a hard 25 s timeout per job, and a worker that is recreated after a timeout or crash.
 * Language data comes only from the bundled directory; the worker never touches the network.
 */
@Injectable()
export class TesseractLabelReaderProvider implements LabelReaderProvider, OnModuleDestroy {
  readonly external = false;
  private readonly logger = new Logger(TesseractLabelReaderProvider.name);
  private worker: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly options: { tessdataDir?: string; fetchImpl?: FetchLike } = {},
  ) {}

  /** Languages actually usable: eng always; urd only if requested by env AND its data file exists. */
  languages(): string {
    const dir = this.options.tessdataDir ?? DEFAULT_TESSDATA_DIR;
    const wanted = this.config
      .get<string>('labelOcrLangs', 'eng')
      .split('+')
      .map((l) => l.trim())
      .filter((l) => /^[a-z]{3}$/.test(l));
    const usable = wanted.filter((l) => existsSync(join(dir, `${l}.traineddata`)));
    return (usable.length ? usable : ['eng']).join('+');
  }

  async read(input: LabelReadInput): Promise<LabelReadResult> {
    const image = await downloadLabelImage(input.imageUrl, this.options.fetchImpl);
    const prepared = await preprocessForOcr(image);
    const text = await this.enqueue(() => this.recognize(prepared));
    const fields = extractLabelFields(text.rawText);
    const confidence: Record<string, number> = { overall: text.confidence };
    for (const key of LABEL_FIELD_KEYS) {
      const value = fields[key];
      if (value) confidence[key] = this.fieldConfidence(value, text.words, text.confidence);
    }
    return {
      rawText: text.rawText,
      fields,
      confidence,
      provider: 'tesseract',
      model: `tesseract.js-${this.languages()}`,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.dropWorker();
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const dir = this.options.tessdataDir ?? DEFAULT_TESSDATA_DIR;
      const created = import('tesseract.js').then(({ createWorker }) =>
        createWorker(this.languages(), 1, {
          langPath: dir,
          gzip: false,
          cacheMethod: 'none',
          errorHandler: (e: unknown) => this.logger.warn(`OCR worker error: ${String(e)}`),
        }),
      );
      created.catch(() => {
        if (this.worker === created) this.worker = null;
      });
      this.worker = created;
    }
    return this.worker;
  }

  private async dropWorker(): Promise<void> {
    const current = this.worker;
    this.worker = null;
    if (current) await current.then((w) => w.terminate()).catch(() => undefined);
  }

  private async recognize(
    image: Buffer,
  ): Promise<{ rawText: string; confidence: number; words: OcrWord[] }> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS);
    });
    try {
      const run = (async () => {
        const worker = await this.getWorker();
        const pass = async (
          img: Buffer,
        ): Promise<{ rawText: string; confidence: number; words: OcrWord[] }> => {
          const { data } = await worker.recognize(img, {}, { blocks: true, text: true });
          const words: OcrWord[] = [];
          for (const block of data.blocks ?? [])
            for (const para of block.paragraphs ?? [])
              for (const line of para.lines ?? [])
                for (const w of line.words ?? [])
                  words.push({ text: w.text, confidence: w.confidence });
          return {
            rawText: data.text ?? '',
            confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
            words,
          };
        };
        const started = Date.now();
        let best = await pass(image);
        for (const angle of [180, 90, 270] as const) {
          if (best.confidence >= OCR_RETRY_BELOW || Date.now() - started > OCR_RETRY_BUDGET_MS)
            break;
          const next = await pass(await rotateImage(image, angle));
          if (next.confidence > best.confidence) best = next;
        }
        return best;
      })();
      run.catch(() => undefined);
      return await Promise.race([run, timeout]);
    } catch (error) {
      await this.dropWorker();
      this.logger.warn(`Label OCR failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new ServiceUnavailableException({
        code: 'LABEL_OCR_FAILED',
        message:
          'The label could not be read right now. Please retake the photo or enter the details manually.',
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private fieldConfidence(value: string, words: OcrWord[], overall: number): number {
    const tokens = value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2);
    const scores = words
      .filter((w) => tokens.includes(w.text.toLowerCase().replace(/[^a-z0-9]+/g, '')))
      .map((w) => w.confidence / 100);
    if (!scores.length) return Math.round(overall * 100) / 100;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  }
}
