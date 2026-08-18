import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StressAnalysisClient } from '../src/domain/satellite/stress-analysis.client';

describe('StressAnalysisClient scientific boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts only field-relative, non-diagnostic anomaly results', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          methodology: 'FIELD_TEMPORAL_BASELINE',
          baseline: {
            method: 'PREVIOUS_VALID_OBSERVATION',
            captureIds: ['11111111-1111-4111-8111-111111111111'],
            observationCount: 1,
          },
          zones: [],
        }),
        { status: 200 },
      ),
    );
    const client = new StressAnalysisClient(
      new ConfigService({ geospatialAiUrl: 'http://analysis.test' }),
    );
    await expect(client.analyse({})).resolves.toMatchObject({
      methodology: 'FIELD_TEMPORAL_BASELINE',
    });
  });

  it('rejects disease labels returned through the satellite-analysis boundary', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          methodology: 'FIELD_TEMPORAL_BASELINE',
          baseline: { method: 'ROLLING_FIELD_BASELINE', captureIds: ['a', 'b', 'c'] },
          zones: [{ label: 'EARLY_BLIGHT' }],
        }),
        { status: 200 },
      ),
    );
    const client = new StressAnalysisClient(
      new ConfigService({ geospatialAiUrl: 'http://analysis.test' }),
    );
    await expect(client.analyse({})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
