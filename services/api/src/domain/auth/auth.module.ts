import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DevelopmentOtpProvider } from './otp/development-otp.provider';
import { OTP_PROVIDER } from './otp/otp-provider';
import { ProductionOtpProvider } from './otp/production-otp.provider';
import { PasswordResetService } from './password-reset.service';
import type { OtpProvider } from './otp/otp-provider';
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    DevelopmentOtpProvider,
    ProductionOtpProvider,
    PasswordResetService,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, DevelopmentOtpProvider, ProductionOtpProvider],
      useFactory: (
        config: ConfigService,
        development: DevelopmentOtpProvider,
        production: ProductionOtpProvider,
      ): OtpProvider =>
        config.get<string>('otpProvider') === 'production' ? production : development,
    },
  ],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard, PasswordResetService],
})
export class AuthModule {}
