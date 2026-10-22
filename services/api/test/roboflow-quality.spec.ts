import type { ConfigService } from '@nestjs/config';
import type sharpFactory from 'sharp';
import { RoboflowVisionProvider } from '../src/domain/crop-scans/providers/roboflow-vision.provider';
import type { VisionInput } from '../src/domain/crop-scans/providers/vision-diagnosis.provider';

// Regression: the compiled build once failed every real scan with "sharp is not a function"
// because the provider used `import('sharp').default`. This test uses the real sharp binary,
// not a mock, so that class of packaging error is caught.
describe('RoboflowVisionProvider.assessQuality with the real image library', () => {
  it('assesses a real image without throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof sharpFactory;
    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 160, b: 60 } },
    })
      .png()
      .toBuffer();
    const provider = new RoboflowVisionProvider({
      get: () => undefined,
    } as unknown as ConfigService);
    const result = await provider.assessQuality({
      image,
      mimeType: 'image/png',
    } as unknown as VisionInput);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
