import {
  ReferralService,
  generateReferralCode,
  resolveReferrer,
} from '../src/domain/growth/referral.service';

describe('referral resolution and generation', () => {
  it('resolves a known referral code case-insensitively', async () => {
    const query = jest.fn().mockResolvedValue([{ userId: 'referrer-1' }]);
    const result = await resolveReferrer({ query } as never, 'abcd1234');
    expect(result).toBe('referrer-1');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('upper(referral_code)=upper($1)'), [
      'abcd1234',
    ]);
  });

  it('returns null for an empty or missing code without querying the database', async () => {
    const query = jest.fn();
    expect(await resolveReferrer({ query } as never, undefined)).toBeNull();
    expect(await resolveReferrer({ query } as never, '   ')).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('generates an 8-character code from a fixed alphabet', () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('myReferral reports the real code and a real invite count', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ code: 'ABCD1234' }])
      .mockResolvedValueOnce([{ count: '3' }]);
    const result = await new ReferralService({ query } as never).myReferral('user-1');
    expect(result).toEqual({ code: 'ABCD1234', invitesCount: 3 });
  });
});
