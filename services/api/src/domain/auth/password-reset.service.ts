import { Inject, Injectable } from '@nestjs/common';
import { OTP_PROVIDER, type OtpChallenge, type OtpProvider } from './otp/otp-provider';
@Injectable()
export class PasswordResetService {
  constructor(@Inject(OTP_PROVIDER) private readonly otp: OtpProvider) {}
  request(identifier: string): Promise<OtpChallenge> {
    return this.otp.requestOtp(identifier, 'password_reset');
  }
}
