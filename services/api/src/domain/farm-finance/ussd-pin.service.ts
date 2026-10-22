import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';

const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class UssdPinService {
  constructor(private readonly db: DataSource) {}

  async setup(userId: string, currentPassword: string, pin: string): Promise<{ configured: true }> {
    if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin))
      throw new BadRequestException({
        code: 'WEAK_USSD_PIN',
        message: 'Choose a less predictable PIN.',
      });
    const users: Array<{ password_hash: string | null; phone: string | null }> =
      await this.db.query(
        `SELECT password_hash,phone FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL`,
        [userId],
      );
    const user = users[0];
    if (
      !user?.password_hash ||
      !user.phone ||
      !(await argon2.verify(user.password_hash, currentPassword))
    )
      throw new UnauthorizedException({
        code: 'STEP_UP_FAILED',
        message: 'Current account credentials could not be verified.',
      });
    const pinHash = await argon2.hash(pin, HASH_OPTIONS);
    await this.db.query(
      `INSERT INTO ussd_credentials(user_id,pin_hash,failed_attempts,locked_until,pin_changed_at)
       VALUES($1,$2,0,NULL,now()) ON CONFLICT(user_id) DO UPDATE SET pin_hash=excluded.pin_hash,
       failed_attempts=0,locked_until=NULL,pin_changed_at=now(),updated_at=now(),version=ussd_credentials.version+1`,
      [userId, pinHash],
    );
    return { configured: true };
  }
}
