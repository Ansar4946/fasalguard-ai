import { ConfigService } from '@nestjs/config';
import { RoboflowVisionProvider } from '../src/domain/crop-scans/providers/roboflow-vision.provider';
import { ScanImageCategory } from '../src/domain/crop-scans/crop-scan.enums';

describe('RoboflowVisionProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses classification API base64 requests and aggregates every image', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            predictions: [
              { class: 'COTTON_LEAF_CURL_SUSPECTED', confidence: 0.8 },
              { class: 'COTTON_HEALTHY', confidence: 0.2 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const provider = new RoboflowVisionProvider(
      new ConfigService({
        roboflowApiKey: 'test-key',
        roboflowModelId: 'cotton-screen',
        roboflowModelVersion: '3',
        roboflowModelTask: 'classification',
        roboflowBaseUrl: 'https://detect.roboflow.com',
      }),
    );
    const result = await provider.predict([
      {
        image: Buffer.from('first'),
        contentType: 'image/jpeg',
        category: ScanImageCategory.LeafFront,
      },
      {
        image: Buffer.from('second'),
        contentType: 'image/jpeg',
        category: ScanImageCategory.WholePlant,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[0] as URL).href).toContain('https://classify.roboflow.com');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(Buffer.from('first').toString('base64'));
    expect(result.predictedCondition).toBe('COTTON_LEAF_CURL_SUSPECTED');
    expect(result.confidence).toBeCloseTo(0.8);
    expect(result.rawProviderResponse).toMatchObject({ imageCount: 2 });
  });
});
