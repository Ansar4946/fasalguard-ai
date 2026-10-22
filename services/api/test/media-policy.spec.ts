import { MediaPurpose } from '../src/domain/media/media.enums';
import type sharpFactory from 'sharp';
import {
  normalizeFilename,
  validateAudioContent,
  validateImageContent,
  validateMediaPolicy,
} from '../src/domain/media/media-policy';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

describe('media policy', () => {
  it('validates audio signatures instead of trusting MIME metadata', () => {
    const ogg = Buffer.alloc(47);
    ogg.write('OggS', 0, 'ascii');
    ogg.writeBigUInt64LE(BigInt(48000), 6);
    ogg[26] = 1;
    ogg[27] = 19;
    ogg.write('OpusHead', 28, 'ascii');
    ogg[37] = 1;
    expect(validateAudioContent(ogg, 'audio/ogg')).toBe(1);
    ogg.writeBigUInt64LE(BigInt(61 * 48000), 6);
    expect(() => validateAudioContent(ogg, 'audio/ogg')).toThrow('between 1 and 60 seconds');
    expect(() => validateAudioContent(Buffer.from('not audio'), 'audio/ogg')).toThrow(
      'Uploaded audio content is corrupt or does not match its declared type.',
    );
  });
  it('normalizes path-like and unsafe filenames', () => {
    expect(normalizeFilename('../../ Cotton Leaf (1).JPG')).toBe('cotton-leaf-1.jpg');
  });
  it('accepts the intended purpose-specific type', () => {
    expect(() => validateMediaPolicy(MediaPurpose.VoiceNote, 'audio/ogg', 1024)).not.toThrow();
  });
  it('rejects an image masquerading as a voice note', () => {
    expect(() => validateMediaPolicy(MediaPurpose.VoiceNote, 'image/jpeg', 1024)).toThrow();
  });
  it('verifies image bytes match the declared MIME type', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#16834a' },
    })
      .png()
      .toBuffer();
    await expect(validateImageContent(png, 'image/png')).resolves.toBeUndefined();
    await expect(validateImageContent(png, 'image/jpeg')).rejects.toThrow(
      'Uploaded image content is corrupt or does not match its declared type.',
    );
  });
});
