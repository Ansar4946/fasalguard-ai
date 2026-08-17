import { MediaPurpose } from '../src/domain/media/media.enums';
import type sharpFactory from 'sharp';
import {
  normalizeFilename,
  validateImageContent,
  validateMediaPolicy,
} from '../src/domain/media/media-policy';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;

describe('media policy', () => {
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
