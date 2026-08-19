import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from '../src/domain/growth/feedback.service';
import { FeedbackContextType } from '../src/domain/growth/growth.enums';

function fakeDb(): { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> } {
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>().mockResolvedValue([]);
  return { query };
}

describe('FeedbackService', () => {
  it('persists all fields including consent_to_quote', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'feedback-1', createdAt: new Date() }]);
    const service = new FeedbackService(db as never);
    const result = (await service.submit('user-1', {
      rating: 5,
      feedback: 'FasalGuard caught a real issue early.',
      contextType: FeedbackContextType.FarmBrainInvestigation,
      consentToQuote: true,
    })) as { id: string };
    expect(result.id).toBe('feedback-1');
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([
      'user-1',
      5,
      'FasalGuard caught a real issue early.',
      FeedbackContextType.FarmBrainInvestigation,
      null,
      true,
    ]);
  });

  it('defaults consentToQuote to false when omitted', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'feedback-2', createdAt: new Date() }]);
    const service = new FeedbackService(db as never);
    await service.submit('user-1', {
      feedback: 'The app is helpful.',
      contextType: FeedbackContextType.General,
    });
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params[5]).toBe(false);
  });

  it('submitEvent rejects ROADMAP_COMPLETION when no matching COMPLETED run exists for the caller', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]); // validateEvent finds nothing
    const service = new FeedbackService(db as never);
    await expect(
      service.submitEvent('user-1', {
        feature: FeedbackContextType.RoadmapCompletion,
        contextId: 'run-1',
        useful: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('submitEvent rejects INCIDENT_RESOLUTION when the incident is not RESOLVED or not owned by the caller', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]); // ownership+state check finds nothing
    const service = new FeedbackService(db as never);
    await expect(
      service.submitEvent('user-1', {
        feature: FeedbackContextType.IncidentResolution,
        contextId: 'incident-1',
        useful: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('submitEvent accepts CROP_DIAGNOSIS for a real diagnosed scan and derives farm_id from it', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ farmId: 'farm-1' }]); // validateEvent finds the scan
    db.query.mockResolvedValueOnce([{ id: 'feedback-3', createdAt: new Date() }]); // INSERT
    const service = new FeedbackService(db as never);
    const result = (await service.submitEvent('user-1', {
      feature: FeedbackContextType.CropDiagnosis,
      contextId: 'scan-1',
      useful: true,
      whatHelped: 'Caught the issue early',
      permissionToQuote: true,
    })) as { id: string };
    expect(result.id).toBe('feedback-3');
    const [, insertParams] = db.query.mock.calls[1] as [string, unknown[]];
    expect(insertParams).toEqual([
      'user-1',
      'farm-1',
      true,
      null,
      'What helped: Caught the issue early',
      FeedbackContextType.CropDiagnosis,
      'scan-1',
      true,
    ]);
  });

  it('submitEvent validates WEEKLY_REPORT against a recent real lifecycle_email_log row, no contextId required', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'log-1' }]); // recent WEEKLY_SUMMARY log row exists
    db.query.mockResolvedValueOnce([{ id: 'feedback-4', createdAt: new Date() }]); // INSERT
    const service = new FeedbackService(db as never);
    const result = (await service.submitEvent('user-1', {
      feature: FeedbackContextType.WeeklyReport,
      useful: true,
    })) as { id: string };
    expect(result.id).toBe('feedback-4');
  });

  it('publish() rejects without real user consent, even for an admin', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'feedback-5', consentToQuote: false }]);
    const service = new FeedbackService(db as never);
    await expect(service.publish('admin-1', 'feedback-5', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('publish() sets published_at/published_by when consent is real', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'feedback-6', consentToQuote: true }]);
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    db.query.mockResolvedValueOnce([[{ id: 'feedback-6', publishedAt: new Date() }], 1]);
    const service = new FeedbackService(db as never);
    const result = (await service.publish('admin-1', 'feedback-6', {
      publicReferenceUrl: 'https://fasalguard.ai/testimonials#feedback-6',
    })) as { id: string };
    expect(result.id).toBe('feedback-6');
  });

  it('report() returns an honest all-null shape when nothing has been submitted', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        feedbackCount: '0',
        usefulTrue: '0',
        usefulAnswered: '0',
        featureBreakdown: '[]',
        testimonialCandidateCount: '0',
        publishedCount: '0',
      },
    ]);
    const service = new FeedbackService(db as never);
    const result = await service.report();
    expect(result.feedbackCount).toBe(0);
    expect(result.positiveRate).toBeNull();
    expect(result.featureBreakdown).toEqual([]);
    expect(result.policy.excludesTestAccounts).toBe(true);
  });

  it('report() computes positive rate and per-feature breakdown from real counts', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        feedbackCount: '5',
        usefulTrue: '3',
        usefulAnswered: '4',
        featureBreakdown: JSON.stringify([
          { feature: 'INCIDENT_RESOLUTION', count: 3, usefulTrue: 2, usefulAnswered: 3 },
          { feature: 'CROP_DIAGNOSIS', count: 2, usefulTrue: 1, usefulAnswered: 1 },
        ]),
        testimonialCandidateCount: '1',
        publishedCount: '0',
      },
    ]);
    const service = new FeedbackService(db as never);
    const result = await service.report();
    expect(result.feedbackCount).toBe(5);
    expect(result.positiveRate).toBeCloseTo(0.75);
    expect(result.featureBreakdown).toEqual([
      { feature: 'INCIDENT_RESOLUTION', count: 3, positiveRate: 2 / 3 },
      { feature: 'CROP_DIAGNOSIS', count: 2, positiveRate: 1 },
    ]);
    expect(result.testimonialCandidateCount).toBe(1);
  });
});
