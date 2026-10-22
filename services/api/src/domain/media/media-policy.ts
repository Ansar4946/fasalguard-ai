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

export function validateAudioContent(body: Buffer, declaredType: string): number {
  const ascii = (start: number, length: number): string =>
    body.subarray(start, start + length).toString('ascii');
  const valid =
    (declaredType === 'audio/wav' && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') ||
    (declaredType === 'audio/ogg' && ascii(0, 4) === 'OggS') ||
    (declaredType === 'audio/webm' &&
      body.length >= 4 &&
      body[0] === 0x1a &&
      body[1] === 0x45 &&
      body[2] === 0xdf &&
      body[3] === 0xa3) ||
    (declaredType === 'audio/mp4' && ascii(4, 4) === 'ftyp') ||
    (declaredType === 'audio/mpeg' &&
      (ascii(0, 3) === 'ID3' || (body[0] === 0xff && (body[1]! & 0xe0) === 0xe0)));
  if (!valid)
    throw new BadRequestException({
      code: 'INVALID_AUDIO_CONTENT',
      message: 'Uploaded audio content is corrupt or does not match its declared type.',
    });
  let durationSeconds = 0;
  if (declaredType === 'audio/wav') {
    if (body.length < 44 || body.readUInt16LE(20) !== 1 || body.readUInt16LE(22) !== 1)
      throw new BadRequestException({
        code: 'UNSUPPORTED_AUDIO_CODEC',
        message: 'WAV voice notes must use mono PCM audio.',
      });
    const sampleRate = body.readUInt32LE(24);
    const bitsPerSample = body.readUInt16LE(34);
    if (sampleRate !== 16000 || bitsPerSample !== 16)
      throw new BadRequestException({
        code: 'UNSUPPORTED_AUDIO_CODEC',
        message: 'WAV voice notes must use 16 kHz 16-bit PCM audio.',
      });
    const dataIndex = body.indexOf(Buffer.from('data'));
    if (dataIndex < 0 || dataIndex + 8 > body.length)
      throw new BadRequestException({
        code: 'INVALID_AUDIO_CONTENT',
        message: 'WAV audio data is missing.',
      });
    const dataBytes = body.readUInt32LE(dataIndex + 4);
    if (dataIndex + 8 + dataBytes > body.length)
      throw new BadRequestException({
        code: 'INVALID_AUDIO_CONTENT',
        message: 'WAV audio data is truncated.',
      });
    durationSeconds = dataBytes / (sampleRate * 2);
  } else if (declaredType === 'audio/ogg') {
    let offset = 0;
    let lastGranule = BigInt(0);
    let firstPayload = -1;
    while (offset < body.length) {
      if (offset + 27 > body.length || ascii(offset, 4) !== 'OggS')
        throw new BadRequestException({
          code: 'INVALID_AUDIO_CONTENT',
          message: 'Ogg page structure is invalid.',
        });
      const segments = body[offset + 26]!;
      const tableEnd = offset + 27 + segments;
      if (tableEnd > body.length)
        throw new BadRequestException({
          code: 'INVALID_AUDIO_CONTENT',
          message: 'Ogg segment table is truncated.',
        });
      let payloadBytes = 0;
      for (let index = offset + 27; index < tableEnd; index += 1) payloadBytes += body[index]!;
      if (tableEnd + payloadBytes > body.length)
        throw new BadRequestException({
          code: 'INVALID_AUDIO_CONTENT',
          message: 'Ogg page payload is truncated.',
        });
      if (firstPayload < 0) firstPayload = tableEnd;
      lastGranule = body.readBigUInt64LE(offset + 6);
      offset = tableEnd + payloadBytes;
    }
    if (firstPayload < 0 || ascii(firstPayload, 8) !== 'OpusHead' || body[firstPayload + 9] !== 1)
      throw new BadRequestException({
        code: 'UNSUPPORTED_AUDIO_CODEC',
        message: 'Ogg voice notes must use mono Opus audio.',
      });
    durationSeconds = Number(lastGranule) / 48000;
  } else {
    throw new BadRequestException({
      code: 'UNSUPPORTED_AUDIO_CODEC',
      message: 'This audio format cannot be validated for speech processing.',
    });
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 60)
    throw new BadRequestException({
      code: 'INVALID_AUDIO_DURATION',
      message: 'Voice recordings must be between 1 and 60 seconds.',
    });
  return durationSeconds;
}
