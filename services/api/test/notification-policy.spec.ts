import { BadRequestException } from '@nestjs/common';
import { NotificationSafetyPolicy } from '../src/domain/notifications/notification.policy';
describe('NotificationSafetyPolicy', () => {
  const policy = new NotificationSafetyPolicy();
  it('blocks emergency language for unconfirmed AI results', () =>
    expect(() =>
      policy.assertSafe({
        title: 'Emergency crop disease',
        body: 'Act now',
        confirmedEvidence: false,
        aiConfidence: 0.92,
      }),
    ).toThrow(BadRequestException));
  it('blocks emergency language for low confidence results', () =>
    expect(() =>
      policy.assertSafe({
        title: 'Critical emergency',
        body: 'Inspect',
        confirmedEvidence: true,
        aiConfidence: 0.61,
      }),
    ).toThrow(BadRequestException));
  it('allows neutral inspection-priority language', () =>
    expect(() =>
      policy.assertSafe({
        title: 'Field inspection suggested',
        body: 'Unconfirmed screening result; inspect affected plants.',
        confirmedEvidence: false,
        aiConfidence: 0.55,
      }),
    ).not.toThrow());
  it('allows emergency wording only with confirmed sufficiently confident evidence', () =>
    expect(() =>
      policy.assertSafe({
        title: 'Emergency regional advisory',
        body: 'Follow the confirmed expert advisory.',
        confirmedEvidence: true,
        aiConfidence: 0.9,
      }),
    ).not.toThrow());
});
