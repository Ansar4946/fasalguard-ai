import { BadRequestException } from '@nestjs/common';
import { MediaPurpose } from './media.enums';
import type sharpFactory from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RULES: Record<MediaPurpose, { mimeTypes: Set<string>; maxBytes: number }> = {
  [MediaPurpose.CropScan]: { mimeTypes: IMAGE_TYPES, maxBytes: 15 * 1024 * 1024 },
  [MediaPurpose.FieldInspection]: { mimeTypes: IMAGE_TYPES, maxBytes: 20 * 1024 * 1024 },
  [MediaPurpose.ExpertReview]: { mimeTypes: IMAGE_TYPES, maxBytes: 20 * 1024 * 1024 },
  [MediaPurpose.VoiceNote]: {
    mimeTypes: new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav']),
    maxBytes: 25 * 1024 * 1024,
  },
  [MediaPurpose.Satellite]: {
    mimeTypes: new Set(['image/tiff', 'image/geotiff', 'application/geotiff']),
    maxBytes: 100 * 1024 * 1024,
  },
  [MediaPurpose.Report]: {
    mimeTypes: new Set([...IMAGE_TYPES, 'application/pdf']),
    maxBytes: 25 * 1024 * 1024,
  },
};

export function validateMediaPolicy(
  purpose: MediaPurpose,
  contentType: string,
  sizeBytes: number,
): void {
  const rule = RULES[purpose];
  if (!rule.mimeTypes.has(contentType))
    throw new BadRequestException({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: `Content type is not allowed for ${purpose}.`,
    });
  if (sizeBytes > rule.maxBytes)
    throw new BadRequestException({
      code: 'MEDIA_TOO_LARGE',
      message: `File exceeds the ${Math.floor(rule.maxBytes / 1024 / 1024)} MB limit.`,
    });
}

export function normalizeFilename(filename: string): string {
  const normalized = filename.normalize('NFKC').split(/[\\/]/).pop() ?? '';
  const extension = normalized.includes('.')
    ? `.${normalized.split('.').pop()!.toLowerCase()}`
    : '';
  const stem = normalized
    .slice(0, extension ? -extension.length : undefined)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (!stem)
    throw new BadRequestException({
      code: 'INVALID_FILENAME',
      message: 'Filename must contain at least one letter or number.',
    });
  return `${stem}${extension.replace(/[^.a-z0-9]/g, '').slice(0, 12)}`;
}

export function validateMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const entries = Object.entries(metadata);
  if (entries.length > 20 || JSON.stringify(metadata).length > 4096)
    throw new BadRequestException({ code: 'INVALID_METADATA', message: 'Metadata is too large.' });
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key))
      throw new BadRequestException({
        code: 'INVALID_METADATA',
        message: 'Metadata key is invalid.',
      });
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)
      throw new BadRequestException({
        code: 'INVALID_METADATA',
        message: 'Metadata values must be scalar.',
      });
  }
  return metadata;
}

export async function validateImageContent(body: Buffer, declaredType: string): Promise<void> {
  try {
    const metadata = await sharp(body, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    }).metadata();
    const expected: Record<string, string> = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    if (!metadata.width || !metadata.height || metadata.format !== expected[declaredType])
      throw new Error('Image signature mismatch');
  } catch {
    throw new BadRequestException({
      code: 'INVALID_IMAGE_CONTENT',
      message: 'Uploaded image content is corrupt or does not match its declared type.',
    });
  }
}
