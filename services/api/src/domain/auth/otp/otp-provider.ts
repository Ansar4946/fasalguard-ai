export interface OtpChallenge {
  challengeId: string;
  expiresAt: Date;
}
export interface OtpProvider {
  requestOtp(destination: string, purpose: 'password_reset'): Promise<OtpChallenge>;
  verifyOtp(challengeId: string, code: string): Promise<boolean>;
}
export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
