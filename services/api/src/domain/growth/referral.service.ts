import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Resolves a referral code to the referring user's id, or null if unknown. Case-insensitive.
 * A plain exported function (not a class method) — like `writeBillingEvent` in
 * `billing.service.ts` — so `auth.service.ts` can call it directly inside its registration
 * transaction without AuthModule needing to import GrowthModule (which itself imports
 * AuthModule for EMAIL_PROVIDER — that would be circular). */
export async function resolveReferrer(
  runner: DataSource | EntityManager,
  code: string | undefined,
): Promise<string | null> {
  if (!code?.trim()) return null;
  const rows: Array<{ userId: string }> = await runner.query(
    `SELECT user_id "userId" FROM farmer_profiles WHERE upper(referral_code)=upper($1)`,
    [code.trim()],
  );
  return rows[0]?.userId ?? null;
}

/** Generates a short, human-shareable code. Collisions are astronomically unlikely at this
 * scale and the DB's UNIQUE constraint is the real backstop. */
export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

@Injectable()
export class ReferralService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async myReferral(userId: string): Promise<{ code: string; invitesCount: number }> {
    const rows: Array<{ code: string }> = await this.db.query(
      `SELECT referral_code "code" FROM farmer_profiles WHERE user_id=$1`,
      [userId],
    );
    const invites: Array<{ count: string }> = await this.db.query(
      `SELECT count(*)::text count FROM farmer_profiles WHERE referred_by_user_id=$1`,
      [userId],
    );
    return { code: rows[0]?.code ?? '', invitesCount: Number(invites[0]?.count ?? 0) };
  }
}
