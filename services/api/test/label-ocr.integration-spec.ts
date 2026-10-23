/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* Real-OCR proof for Dawai Check (no database). Generates label images with sharp + SVG text and runs the
 * REAL TesseractLabelReaderProvider (bundled eng.traineddata, nothing downloaded) end to end.
 * Run: OCR_PROOF=1 npx jest test/label-ocr.integration-spec.ts --forceExit
 * Results are printed and also written to OCR_PROOF_OUT when set. Synthetic labels only. */
import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import type sharpFactory from 'sharp';
import { TesseractLabelReaderProvider } from '../src/domain/pesticide-check/providers/tesseract-label-reader.provider';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

const enabled = process.env.OCR_PROOF === '1';
const suite = enabled ? describe : describe.skip;

const LINES = [
  { t: 'DEMO Imidacloprid 20% SL', s: 54, b: true },
  { t: 'INSECTICIDE', s: 30 },
  { t: 'Active Ingredient: Imidacloprid 20% SL', s: 30 },
  { t: 'Manufactured by: Demo Agro Chemicals Pvt Ltd', s: 28 },
  { t: 'Reg. No. 1234/2020', s: 30 },
  { t: 'Batch No: B2407A', s: 30 },
  { t: 'Mfg: 03/2026   Exp: 03/2028', s: 30 },
  { t: 'Net contents 250 ml', s: 28 },
];
const EXPECTED = {
  brandName: 'DEMO Imidacloprid 20% SL',
  concentration: '20%',
  formulation: 'SL',
  registrationNo: '1234/2020',
  batchNo: 'B2407A',
  expiryDate: '03/2028',
  manufacturingDate: '03/2026',
};

function svg(width: number, fg: string, bg: string, scale = 1): string {
  const h = Math.round(620 * scale);
  let y = 0;
  const text = LINES.map((l) => {
    y += Math.round((l.s + 28) * scale);
    const safe = l.t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<text x="${Math.round(40 * scale)}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(l.s * scale)}" font-weight="${l.b ? 700 : 400}" fill="${fg}">${safe}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${text}</svg>`;
}

const render = (width: number, fg: string, bg: string, scale = 1): ReturnType<typeof sharp> =>
  sharp(Buffer.from(svg(width, fg, bg, scale)));

async function variants(): Promise<Array<{ name: string; image: Buffer }>> {
  const out: Array<{ name: string; image: Buffer }> = [];
  out.push({
    name: 'clean-1200px',
    image: await render(1200, '#111', '#fff').jpeg().toBuffer(),
  });
  out.push({
    name: 'low-contrast',
    image: await render(1200, '#8a8a8a', '#c9c9c9').jpeg({ quality: 80 }).toBuffer(),
  });
  out.push({
    name: 'small-500px',
    image: await render(500, '#111', '#fff', 500 / 1200)
      .jpeg({ quality: 80 })
      .toBuffer(),
  });
  out.push({
    name: 'rotated-4deg',
    image: await sharp(await render(1200, '#111', '#fff').png().toBuffer())
      .rotate(4, { background: '#fff' })
      .jpeg()
      .toBuffer(),
  });
  out.push({
    name: 'exif-rotated-90',
    image: await sharp(await render(1200, '#111', '#fff').png().toBuffer())
      .rotate(270) // pixels stored sideways, EXIF orientation 6 says "rotate 90 CW to display" (phone photo)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer(),
  });
  out.push({
    name: 'upside-down-no-exif',
    image: await sharp(await render(1200, '#111', '#fff').png().toBuffer())
      .rotate(180)
      .jpeg()
      .toBuffer(),
  });
  out.push({
    name: 'blurred-and-noisy',
    image: await sharp(await render(1200, '#222', '#f2efe6').png().toBuffer())
      .blur(1.4)
      .modulate({ brightness: 0.9 })
      .jpeg({ quality: 45 })
      .toBuffer(),
  });
  out.push({
    name: 'blank-photo',
    image: await sharp({ create: { width: 900, height: 600, channels: 3, background: '#777' } })
      .jpeg()
      .toBuffer(),
  });
  return out;
}

suite('real Tesseract label reading (synthetic labels)', () => {
  jest.setTimeout(240_000);
  it('reads generated labels and reports honestly', async () => {
    const provider = new TesseractLabelReaderProvider(new ConfigService({ labelOcrLangs: 'eng' }), {
      fetchImpl: (url) => {
        const body = images.get(url)!;
        return Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new Uint8Array(body).buffer),
        });
      },
    });
    const images = new Map<string, Buffer>();
    const report: string[] = [];
    for (const v of await variants()) {
      images.set(`mem://${v.name}`, v.image);
      const started = Date.now();
      const r = await provider.read({ imageUrl: `mem://${v.name}` });
      const ms = Date.now() - started;
      const hits = Object.entries(EXPECTED).map(([k, want]) => {
        const got = (r.fields as Record<string, string | undefined>)[k];
        const ok =
          (got ?? '').toLowerCase().replace(/\s/g, '') === want.toLowerCase().replace(/\s/g, '');
        return `${k}: ${ok ? 'OK ' : 'MISS'} got=${JSON.stringify(got)}`;
      });
      report.push(
        `--- ${v.name} (${ms} ms, overall conf ${r.confidence.overall?.toFixed(2)}) model=${r.model}`,
        ...hits,
        `activeIngredient=${JSON.stringify(r.fields.activeIngredient)} company=${JSON.stringify(r.fields.company)}`,
        `rawText: ${JSON.stringify(r.rawText.slice(0, 400))}`,
      );
    }
    await provider.onModuleDestroy();
    const text = report.join('\n');
    console.log(text);
    if (process.env.OCR_PROOF_OUT) writeFileSync(process.env.OCR_PROOF_OUT, text);
    expect(report.length).toBeGreaterThan(0);
  });
});
