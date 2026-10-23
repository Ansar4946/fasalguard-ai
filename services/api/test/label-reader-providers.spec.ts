/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ConfigService } from '@nestjs/config';
import type sharpFactory from 'sharp';
import { FakeLabelReaderProvider } from '../src/domain/pesticide-check/providers/fake-label-reader.provider';
import {
  normalizeLabelReaderChoice,
  selectLabelReader,
} from '../src/domain/pesticide-check/providers/label-reader.factory';
import type { LabelReaderProvider } from '../src/domain/pesticide-check/providers/label-reader.provider';
import {
  OpenAICompatibleVisionLabelReaderProvider,
  parseVisionLabelJson,
  type VisionFetch,
} from '../src/domain/pesticide-check/providers/openai-compatible-vision-label-reader.provider';
import { TesseractLabelReaderProvider } from '../src/domain/pesticide-check/providers/tesseract-label-reader.provider';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

const toArrayBuffer = (b: Buffer): ArrayBuffer => new Uint8Array(b).buffer;
const stub = (name: string): LabelReaderProvider => ({
  external: false,
  read: () =>
    Promise.resolve({ rawText: name, fields: {}, confidence: {}, provider: name, model: name }),
});
const readers = { tesseract: stub('t'), openaiCompatible: stub('o'), fake: stub('f') };

describe('label reader factory', () => {
  it('selects by LABEL_READER_PROVIDER and defaults to tesseract', () => {
    expect(selectLabelReader('fake', readers)).toBe(readers.fake);
    expect(selectLabelReader('openai-compatible', readers)).toBe(readers.openaiCompatible);
    expect(selectLabelReader('tesseract', readers)).toBe(readers.tesseract);
    expect(selectLabelReader(undefined, readers)).toBe(readers.tesseract);
    expect(selectLabelReader('nonsense', readers)).toBe(readers.tesseract);
    expect(normalizeLabelReaderChoice('fake')).toBe('fake');
  });
});

describe('fake label reader', () => {
  it('is deterministic and parses its own text', async () => {
    const fake = new FakeLabelReaderProvider();
    const a = await fake.read({ imageUrl: 'http://x/a' });
    const b = await fake.read({ imageUrl: 'http://x/b' });
    expect(a).toEqual(b);
    expect(a.fields.brandName).toBe('DEMO Imidacloprid 20% SL');
    expect((await fake.read({ imageUrl: 'http://x/banned' })).rawText).toMatch(/Endosulfan/);
  });
});

describe('tesseract language selection', () => {
  const cfg = (langs: string) => new ConfigService({ labelOcrLangs: langs });
  it('stays on eng unless urd data is present', () => {
    expect(new TesseractLabelReaderProvider(cfg('eng')).languages()).toBe('eng');
    expect(new TesseractLabelReaderProvider(cfg('eng+urd')).languages()).toBe('eng');
    expect(new TesseractLabelReaderProvider(cfg('xx!')).languages()).toBe('eng');
  });
});

describe('OpenAI-compatible vision label reader', () => {
  const config = new ConfigService({
    labelVisionBaseUrl: 'https://vision.example.test/v1/',
    labelVisionApiKey: 'test-key-not-real',
    labelVisionModel: 'vision-test',
  });
  let png: Buffer;
  beforeAll(async () => {
    png = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
  });
  const imageFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(toArrayBuffer(png)),
    });
  const fallback = (): LabelReaderProvider & { calls: number } => {
    const f = {
      calls: 0,
      external: false,
      read: () => {
        f.calls += 1;
        return Promise.resolve({
          rawText: 'fallback text',
          fields: {},
          confidence: {},
          provider: 'tesseract',
          model: 'm',
        });
      },
    };
    return f;
  };
  const reply = (content: unknown, ok = true, status = 200): VisionFetch =>
    jest.fn(() =>
      Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve({ choices: [{ message: { content } }] }),
      }),
    );

  it('uses the model JSON, sends a data URL and a bearer key, and fills gaps from the text', async () => {
    const good = JSON.stringify({
      rawText: 'DEMO Imidacloprid 20% SL\nExp: 03/2028',
      brandName: 'DEMO Imidacloprid 20% SL',
      activeIngredient: null,
      expiryDate: '03/2028',
      confidence: { brandName: 0.97 },
      extraneous: 'ignored',
    });
    const fetchImpl = reply(good);
    const fb = fallback();
    const p = new OpenAICompatibleVisionLabelReaderProvider(config, fb, { fetchImpl, imageFetch });
    const r = await p.read({ imageUrl: 'http://img/1' });
    expect(r.provider).toBe('openai-compatible');
    expect(r.model).toBe('vision-test');
    expect(r.fields.brandName).toBe('DEMO Imidacloprid 20% SL');
    expect(r.fields.expiryDate).toBe('03/2028');
    expect(r.confidence).toEqual({ brandName: 0.97 });
    expect(fb.calls).toBe(0);
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://vision.example.test/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer test-key-not-real');
    expect(init.body).toContain('data:image/jpeg;base64,');
    expect(init.body).toContain('ONE JSON object');
  });

  it.each([
    ['HTTP error', reply('{}', false, 500)],
    ['not JSON', reply('here is the label: nope')],
    ['wrong shape', reply('[1,2]')],
    ['missing rawText', reply(JSON.stringify({ brandName: 'x' }))],
    ['non-string field', reply(JSON.stringify({ rawText: 'a', brandName: 5 }))],
    [
      'confidence out of range',
      reply(JSON.stringify({ rawText: 'a', confidence: { brandName: 7 } })),
    ],
    ['empty content', reply(undefined)],
    ['network failure', jest.fn(() => Promise.reject(new Error('boom'))) as unknown as VisionFetch],
  ])('falls back to the local reader on %s', async (_name, fetchImpl) => {
    const fb = fallback();
    const p = new OpenAICompatibleVisionLabelReaderProvider(config, fb, { fetchImpl, imageFetch });
    const r = await p.read({ imageUrl: 'http://img/1' });
    expect(r.provider).toBe('tesseract');
    expect(fb.calls).toBe(1);
  });

  it('falls back when the image cannot be downloaded or is not an image', async () => {
    const fb = fallback();
    const p1 = new OpenAICompatibleVisionLabelReaderProvider(config, fb, {
      fetchImpl: reply('{}'),
      imageFetch: () => Promise.reject(new Error('down')),
    });
    await p1.read({ imageUrl: 'http://img/1' });
    const garbage = Buffer.from('not an image');
    const p2 = new OpenAICompatibleVisionLabelReaderProvider(config, fb, {
      fetchImpl: reply('{}'),
      imageFetch: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(toArrayBuffer(garbage)),
        }),
    });
    await p2.read({ imageUrl: 'http://img/1' });
    expect(fb.calls).toBe(2);
  });

  it('falls back without calling the network when credentials are missing', async () => {
    const fetchImpl = reply('{}');
    const fb = fallback();
    const p = new OpenAICompatibleVisionLabelReaderProvider(new ConfigService({}), fb, {
      fetchImpl,
      imageFetch,
    });
    await p.read({ imageUrl: 'http://img/1' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fb.calls).toBe(1);
  });

  it('parseVisionLabelJson tolerates markdown fences and drops unknown keys', () => {
    const parsed = parseVisionLabelJson('```json\n{"rawText":"hi","brandName":" A ","zzz":1}\n```');
    expect(parsed).toEqual({ rawText: 'hi', fields: { brandName: 'A' }, confidence: {} });
  });
});
