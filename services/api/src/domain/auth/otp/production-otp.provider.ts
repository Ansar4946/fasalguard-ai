import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OtpChallenge, OtpProvider } from './otp-provider';
@Injectable()
export class ProductionOtpProvider implements OtpProvider {
  requestOtp(): Promise<OtpChallenge> {
    throw new ServiceUnavailableException({
      code: 'OTP_PROVIDER_NOT_CONFIGURED',
      message: 'Production OTP delivery is not configured.',
    });
  }
  verifyOtp(): Promise<boolean> {
    throw new ServiceUnavailableException({
      code: 'OTP_PROVIDER_NOT_CONFIGURED',
      message: 'Production OTP verification is not configured.',
    });
  }
}
