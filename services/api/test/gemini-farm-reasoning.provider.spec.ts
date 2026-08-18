import { ConfigService } from '@nestjs/config';
import { GeminiFarmReasoningProvider } from '../src/domain/farm-brain/providers/gemini-farm-reasoning.provider';
import {
  FARM_BRAIN_SCHEMA_VERSION,
  type FarmBrainInput,
} from '../src/domain/farm-brain/farm-brain.types';

const input: FarmBrainInput = {
  schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
  generatedAt: '2026-08-17T12:00:00.000Z',
  farm: { id: 'farm-1', name: 'Green Farm' },
  crop: [],
  satellite: { latest: [], vegetationTrend: [], anomalyEvidence: [] },
  weather: {},
  visualEvidence: [],
  history: { currentHealth: [], interventions: [], farmerObservations: [], recoveryChecks: [] },
  activeIncidents: [],
  dataFreshness: {},
  safetyContext: {
    satelliteIsNonDiagnostic: true,
    farmerTextIsUntrustedData: true,
    approvedGuidanceOnly: true,
  },
};

describe('GeminiFarmReasoningProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses server credentials and accepts schema-controlled output', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-test-001',
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
                      healthStatus: 'UNKNOWN',
                      riskScore: 0,
                      findings: [],
                      hypotheses: [],
                      evidence: [],
                      missingEvidence: ['No field evidence'],
                      recommendedActions: [],
                      requiresHumanReview: false,
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
        }),
        { status: 200 },
      ),
    );
    const provider = new GeminiFarmReasoningProvider(
      new ConfigService({
        geminiTransport: 'google-ai',
        geminiApiKey: 'server-only-test-key',
        geminiModel: 'gemini-test',
      }),
    );
    const result = await provider.investigate(input);
    expect(result).toMatchObject({ provider: 'GOOGLE_GEMINI', modelVersion: 'gemini-test-001' });
    const [url, request] = fetcher.mock.calls[0]!;
    const urlText = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const bodyText = typeof request?.body === 'string' ? request.body : '';
    expect(urlText).toContain('key=server-only-test-key');
    expect(bodyText).not.toContain('server-only-test-key');
  });
});
