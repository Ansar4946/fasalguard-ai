import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OtpChallenge, OtpProvider } from './otp-provider';
@Injectable()
export class DevelopmentOtpProvider implements OtpProvider {
  private readonly challenges = new Map<string, { code: string; expiresAt: Date }>();
  requestOtp(): Promise<OtpChallenge> {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    this.challenges.set(challengeId, { code: '000000', expiresAt });
    return Promise.resolve({ challengeId, expiresAt });
  }
  verifyOtp(challengeId: string, code: string): Promise<boolean> {
    const value = this.challenges.get(challengeId);
    if (!value || value.expiresAt <= new Date() || code !== value.code)
      return Promise.resolve(false);
    this.challenges.delete(challengeId);
    return Promise.resolve(true);
  }
}
