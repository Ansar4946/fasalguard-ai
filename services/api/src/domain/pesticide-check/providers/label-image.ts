import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type sharpFactory from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

export const MAX_LABEL_IMAGE_BYTES = 20 * 1024 * 1024;
/** Small photos are upscaled to at least this width so OCR sees legible glyphs. */
export const MIN_OCR_WIDTH = 1200;
export const MAX_OCR_WIDTH = 2400;

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Download the (signed, short-lived) image URL with a timeout and a size cap. */
export async function downloadLabelImage(
  url: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 10_000,
): Promise<Buffer> {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ServiceUnavailableException({
      code: 'LABEL_IMAGE_UNAVAILABLE',
      message: 'The label photo could not be loaded. Please try again.',
    });
  }
  if (!response.ok)
    throw new ServiceUnavailableException({
      code: 'LABEL_IMAGE_UNAVAILABLE',
      message: 'The label photo could not be loaded. Please try again.',
    });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_LABEL_IMAGE_BYTES)
    throw new UnprocessableEntityException({
      code: 'LABEL_IMAGE_INVALID',
      message: 'The label photo is empty or too large.',
    });
  return body;
}

/** EXIF auto-rotate, greyscale, contrast normalisation, upscale small images to >=1200 px wide. */
export async function preprocessForOcr(body: Buffer): Promise<Buffer> {
  try {
    const rotated = await sharp(body, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const width = rotated.info.width;
    const target = Math.min(MAX_OCR_WIDTH, Math.max(MIN_OCR_WIDTH, width));
    return await sharp(rotated.data)
      .grayscale()
      .normalise()
      .resize({ width: target, withoutEnlargement: false, kernel: 'lanczos3' })
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    throw new UnprocessableEntityException({
      code: 'LABEL_IMAGE_INVALID',
      message: 'The label photo could not be processed. Please retake it.',
    });
  }
}

/** Rotate already-preprocessed pixels by a multiple of 90 degrees (used to retry sideways/upside-down photos). */
export async function rotateImage(body: Buffer, angle: 90 | 180 | 270): Promise<Buffer> {
  return sharp(body).rotate(angle).png().toBuffer();
}

/** A modest JPEG for hosted vision models (smaller upload, EXIF-rotated). */
export async function preprocessForVision(body: Buffer): Promise<Buffer> {
  try {
    return await sharp(body, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new UnprocessableEntityException({
      code: 'LABEL_IMAGE_INVALID',
      message: 'The label photo could not be processed. Please retake it.',
    });
  }
}
