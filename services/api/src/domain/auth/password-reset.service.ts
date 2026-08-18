import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { EMAIL_PROVIDER, type EmailProvider } from './email/email-provider';
import { OTP_PROVIDER, type OtpChallenge, type OtpProvider } from './otp/otp-provider';

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  request(identifier: string): Promise<OtpChallenge> {
    return this.otp.requestOtp(identifier, 'password_reset');
  }

  async requestSetup(email: string): Promise<void> {
    const users: Array<{ id: string; email: string }> = await this.db.query(
      `SELECT id,email FROM users WHERE lower(email)=lower($1) AND status='active' AND deleted_at IS NULL`,
      [email],
    );
    const user = users[0];
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const ttlMinutes = this.config.get<number>('passwordSetupTtlMinutes', 30);
    await this.db.transaction(async (manager) => {
      await manager.query(
        `UPDATE password_setup_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,
        [user.id],
      );
      await manager.query(
        `INSERT INTO password_setup_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+($3||' minutes')::interval)`,
        [user.id, hash, String(ttlMinutes)],
      );
    });
    const webUrl = this.config.get<string>('webAppUrl', 'http://localhost:3000').replace(/\/$/, '');
    await this.email.sendPasswordSetup({
      recipient: user.email,
      setupUrl: `${webUrl}/set-password?token=${encodeURIComponent(token)}`,
      expiresInMinutes: ttlMinutes,
    });
  }

  async completeSetup(token: string, password: string): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const changed = await this.db.transaction(async (manager) => {
      const rows: Array<{ id: string; user_id: string }> = await manager.query(
        `SELECT id,user_id FROM password_setup_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
        [hash],
      );
      const setup = rows[0];
      if (!setup) return false;
      await manager.query(
        `UPDATE users SET password_hash=$2,updated_at=now(),version=version+1 WHERE id=$1`,
        [setup.user_id, passwordHash],
      );
      await manager.query(`UPDATE password_setup_tokens SET used_at=now() WHERE id=$1`, [setup.id]);
      return true;
    });
    if (!changed)
      throw new BadRequestException({
        code: 'INVALID_SETUP_TOKEN',
        message: 'This password setup link is invalid or expired.',
      });
  }
}
