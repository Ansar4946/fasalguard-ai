import { ServiceUnavailableException } from '@nestjs/common';
import { FarmBrainToolName, FarmHealthStatus } from '../src/domain/farm-brain/farm-brain.enums';
import { validateFarmBrainResult } from '../src/domain/farm-brain/farm-brain.schema';
import { FARM_BRAIN_SCHEMA_VERSION } from '../src/domain/farm-brain/farm-brain.types';

const valid = {
  schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
  healthStatus: FarmHealthStatus.AtRisk,
  riskScore: 0.82,
  findings: [{ statement: 'Vegetation declined relative to baseline.', evidenceIds: ['sat-1'] }],
  hypotheses: [
    {
      statement: 'Water stress is possible.',
      confidence: 0.7,
      evidenceIds: ['sat-1'],
      uncertainty: 'Ground inspection is missing.',
    },
  ],
  evidence: ['sat-1'],
  missingEvidence: ['Recent ground-level photo'],
  recommendedActions: [
    {
      tool: FarmBrainToolName.RequestFarmerPhoto,
      reason: 'Collect ground evidence.',
      arguments: {},
    },
  ],
  requiresHumanReview: false,
};

describe('Farm Brain structured schema and safety policy', () => {
  it('accepts a bounded, evidence-grounded assessment', () => {
    expect(validateFarmBrainResult(valid, new Set(['sat-1']))).toMatchObject({ riskScore: 0.82 });
  });

  it('rejects invented evidence references', () => {
    expect(() =>
      validateFarmBrainResult({ ...valid, evidence: ['invented'] }, new Set(['sat-1'])),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects disease hypotheses grounded only in satellite evidence', () => {
    expect(() =>
      validateFarmBrainResult(
        {
          ...valid,
          hypotheses: [
            {
              statement: 'Early blight is present.',
              confidence: 0.8,
              evidenceIds: ['sat-1'],
              uncertainty: 'Not confirmed.',
            },
          ],
        },
        new Set(['sat-1']),
        new Set(),
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('requires a farmer-photo request when satellite anomalies have no visual evidence', () => {
    expect(() =>
      validateFarmBrainResult(
        { ...valid, recommendedActions: [] },
        new Set(['sat-1']),
        new Set(),
        new Set(['sat-1']),
      ),
    ).toThrow('satellite anomaly without a farmer-photo evidence request');
  });

  it('rejects incident creation until a hypothesis cites visual evidence', () => {
    expect(() =>
      validateFarmBrainResult(
        {
          ...valid,
          recommendedActions: [
            {
              tool: FarmBrainToolName.RequestFarmerPhoto,
              reason: 'Collect ground evidence.',
              arguments: { zone: 'Southeast', urgency: 'today' },
            },
            {
              tool: FarmBrainToolName.CreateIncident,
              reason: 'Open an investigation.',
              arguments: {},
            },
          ],
        },
        new Set(['sat-1']),
        new Set(),
        new Set(['sat-1']),
      ),
    ).toThrow('incident proposal without a visual-evidence-grounded hypothesis');
  });

  it('allows incident creation after a cautious hypothesis cites farmer imagery', () => {
    expect(
      validateFarmBrainResult(
        {
          ...valid,
          hypotheses: [
            {
              statement: 'A fungal condition is probable but not confirmed.',
              confidence: 0.72,
              evidenceIds: ['sat-1', 'photo-1'],
              uncertainty: 'Expert review remains appropriate.',
            },
          ],
          evidence: ['sat-1', 'photo-1'],
          recommendedActions: [
            {
              tool: FarmBrainToolName.CreateIncident,
              reason: 'Track the evidence.',
              arguments: {},
            },
          ],
        },
        new Set(['sat-1', 'photo-1']),
        new Set(['photo-1']),
        new Set(['sat-1']),
      ).recommendedActions,
    ).toHaveLength(1);
  });

  it('permits a cautious condition hypothesis when ground-level visual evidence is cited', () => {
    const output = validateFarmBrainResult(
      {
        ...valid,
        hypotheses: [
          {
            statement: 'Early blight is a possible hypothesis.',
            confidence: 0.6,
            evidenceIds: ['photo-1'],
            uncertainty: 'Expert confirmation is required.',
          },
        ],
        evidence: ['photo-1'],
      },
      new Set(['sat-1', 'photo-1']),
      new Set(['photo-1']),
    );
    expect(output.requiresHumanReview).toBe(true);
  });

  it('rejects chemical and dosage instructions from model output', () => {
    expect(() =>
      validateFarmBrainResult(
        {
          ...valid,
          recommendedActions: [
            {
              tool: FarmBrainToolName.CreateInspectionTask,
              reason: 'Apply fungicide dosage now.',
              arguments: {},
            },
          ],
        },
        new Set(['sat-1']),
      ),
    ).toThrow(ServiceUnavailableException);
  });
});
