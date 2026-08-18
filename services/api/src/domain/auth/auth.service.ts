import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BillingEventType, PlanCode, SubscriptionStatus } from '../billing/billing.enums';
import { writeBillingEvent } from '../billing/billing.service';
import { AcquisitionSource } from '../growth/growth.enums';
import { generateReferralCode, resolveReferrer } from '../growth/referral.service';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource, type EntityManager } from 'typeorm';
import { UserRole, UserStatus } from '../identity/identity.enums';
import type { LoginDto, RegisterDto } from './dto/auth.dto';
import type { AuthPrincipal, CurrentUser, SessionContext, TokenPair } from './auth.types';
import { EMAIL_PROVIDER, type EmailProvider } from './email/email-provider';
interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
}
interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  token_family: string;
  expires_at: Date;
  revoked_at: Date | null;
  role: UserRole;
  device_id: string | null;
}
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}
  async register(
    dto: RegisterDto,
    context: SessionContext,
  ): Promise<{ user: CurrentUser; tokens: TokenPair; emailDelivery: 'sent' | 'failed' }> {
    const result = await this.db.transaction(async (manager) => {
      const exists: Array<{ id: string }> = await manager.query(
        `SELECT id FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL`,
        [dto.email],
      );
      if (exists.length)
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS',
          message: 'An account already exists for this email.',
        });
      if (dto.phone) {
        const phoneExists: Array<{ id: string }> = await manager.query(
          `SELECT id FROM users WHERE phone=$1 AND deleted_at IS NULL`,
          [dto.phone],
        );
        if (phoneExists.length)
          throw new ConflictException({
            code: 'PHONE_ALREADY_REGISTERED',
            message: 'An account already exists for this phone number.',
          });
      }
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      const users: UserRow[] = await manager.query(
        `INSERT INTO users(email,phone,password_hash,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,email,phone,role,status,password_hash`,
        [dto.email, dto.phone ?? null, passwordHash, UserRole.Farmer, UserStatus.Active],
      );
      const user = users[0]!;
      const referredByUserId = await resolveReferrer(manager, dto.referralCode);
      const acquisitionSource =
        dto.acquisitionSource ??
        (referredByUserId ? AcquisitionSource.Referral : AcquisitionSource.Direct);
      await manager.query(
        `INSERT INTO farmer_profiles(user_id,full_name,preferred_language,acquisition_source,referred_by_user_id,referral_code)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [
          user.id,
          dto.fullName,
          dto.preferredLanguage ?? 'en',
          acquisitionSource,
          referredByUserId,
          generateReferralCode(),
        ],
      );
      const subscriptionId = randomUUID();
      await manager.query(
        `INSERT INTO subscriptions(id,user_id,plan_code,status,started_at) VALUES($1,$2,$3,$4,now())`,
        [subscriptionId, user.id, PlanCode.Free, SubscriptionStatus.Active],
      );
      await writeBillingEvent(
        manager,
        subscriptionId,
        user.id,
        BillingEventType.SubscriptionCreated,
        {
          planCode: PlanCode.Free,
          reason: 'registration',
        },
      );
      for (const consent of dto.consents)
        await manager.query(
          `INSERT INTO consents(user_id,type,policy_version,granted,recorded_at) VALUES($1,$2,$3,$4,now())`,
          [user.id, consent.type, consent.policyVersion, consent.granted],
        );
      const deviceId = await this.upsertDevice(
        manager,
        user.id,
        dto.device.deviceIdentifier,
        dto.device.platform,
      );
      return {
        user: this.publicUser(user),
        tokens: await this.issueSession(manager, user, deviceId, context),
      };
    });
    let emailDelivery: 'sent' | 'failed' = 'sent';
    try {
      await this.email.sendCredentials({ recipient: dto.email, password: dto.password });
    } catch {
      emailDelivery = 'failed';
    }
    return { ...result, emailDelivery };
  }
  async login(
    dto: LoginDto,
    context: SessionContext,
  ): Promise<{ user: CurrentUser; tokens: TokenPair }> {
    const rows: UserRow[] = await this.db.query(
      `SELECT id,email,phone,password_hash,role,status FROM users WHERE (lower(email)=lower($1) OR phone=$1) AND deleted_at IS NULL`,
      [dto.identifier],
    );
    const user = rows[0];
    if (!user || user.status !== UserStatus.Active)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'The supplied credentials are invalid.',
      });
    return this.db.transaction(async (manager) => {
      const deviceId = await this.upsertDevice(
        manager,
        user.id,
        dto.device.deviceIdentifier,
        dto.device.platform,
      );
      await manager.query(
        `UPDATE users SET last_login_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
        [user.id],
      );
      return {
        user: this.publicUser(user),
        tokens: await this.issueSession(manager, user, deviceId, context),
      };
    });
  }
  async refresh(token: string, context: SessionContext): Promise<TokenPair> {
    const hash = this.hashToken(token);
    const outcome = await this.db.transaction(async (manager): Promise<TokenPair | 'reused'> => {
      const rows: SessionRow[] = await manager.query(
        `SELECT s.id,s.user_id,s.device_id,s.refresh_token_hash,s.token_family,s.expires_at,s.revoked_at,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_token_hash=$1 FOR UPDATE`,
        [hash],
      );
      const current = rows[0];
      if (!current)
        throw new UnauthorizedException({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'The refresh token is invalid.',
        });
      if (current.revoked_at) {
        await manager.query(
          `UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoke_reason='reuse_detected',updated_at=now(),version=version+1 WHERE token_family=$1`,
          [current.token_family],
        );
        return 'reused';
      }
      if (new Date(current.expires_at) <= new Date())
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'The refresh token has expired.',
        });
      const userRows: UserRow[] = await manager.query(
        `SELECT id,email,phone,password_hash,role,status FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL`,
        [current.user_id],
      );
      const user = userRows[0];
      if (!user) throw new UnauthorizedException();
      const next = await this.issueSession(
        manager,
        user,
        current.device_id,
        context,
        current.token_family,
      );
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(),revoke_reason='rotated',replaced_by_session_id=$2,last_used_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
        [current.id, next.sessionId],
      );
      return {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        tokenType: 'Bearer',
        expiresIn: next.expiresIn,
      };
    });
    if (outcome === 'reused') {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh-token reuse was detected; this session family was revoked.',
      });
    }
    return outcome;
  }
  async logout(userId: string, token: string): Promise<void> {
    await this.db.query(
      `UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoke_reason=coalesce(revoke_reason,'logout'),updated_at=now(),version=version+1 WHERE user_id=$1 AND refresh_token_hash=$2`,
      [userId, this.hashToken(token)],
    );
  }
  async me(principal: AuthPrincipal): Promise<CurrentUser> {
    const rows: UserRow[] = await this.db.query(
      `SELECT id,email,phone,password_hash,role,status FROM users WHERE id=$1`,
      [principal.userId],
    );
    if (!rows[0]) throw new UnauthorizedException();
    return this.publicUser(rows[0]);
  }
  async sessions(userId: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT s.id,s.device_id AS "deviceId",d.device_identifier AS "deviceIdentifier",d.platform,s.ip_address AS "ipAddress",s.user_agent AS "userAgent",s.created_at AS "createdAt",s.last_used_at AS "lastUsedAt",s.expires_at AS "expiresAt",s.revoked_at AS "revokedAt" FROM auth_sessions s LEFT JOIN devices d ON d.id=s.device_id WHERE s.user_id=$1 ORDER BY s.created_at DESC`,
      [userId],
    );
  }
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const result: Array<{ id: string }> = await this.db.query(
      `UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoke_reason=coalesce(revoke_reason,'user_revoked'),updated_at=now(),version=version+1 WHERE id=$1 AND user_id=$2 RETURNING id`,
      [sessionId, userId],
    );
    return result.length > 0;
  }
  async revokeAllSessions(userId: string): Promise<number> {
    const rows: Array<{ id: string }> = await this.db.query(
      `UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoke_reason=coalesce(revoke_reason,'revoke_all'),updated_at=now(),version=version+1 WHERE user_id=$1 AND revoked_at IS NULL RETURNING id`,
      [userId],
    );
    return rows.length;
  }
  private async upsertDevice(
    m: EntityManager,
    userId: string,
    identifier: string,
    platform: string,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await m.query(
      `INSERT INTO devices(user_id,device_identifier,platform,last_seen_at) VALUES($1,$2,$3,now()) ON CONFLICT DO NOTHING RETURNING id`,
      [userId, identifier, platform],
    );
    if (rows[0]) return rows[0].id;
    const existing: Array<{ id: string }> = await m.query(
      `SELECT id FROM devices WHERE user_id=$1 AND device_identifier=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [userId, identifier],
    );
    if (existing[0]) return existing[0].id;
    const inserted: Array<{ id: string }> = await m.query(
      `INSERT INTO devices(user_id,device_identifier,platform,last_seen_at) VALUES($1,$2,$3,now()) RETURNING id`,
      [userId, identifier, platform],
    );
    const created = inserted[0];
    if (!created) throw new Error('Device creation did not return an identifier.');
    return created.id;
  }
  private async issueSession(
    m: EntityManager,
    user: UserRow,
    deviceId: string | null,
    context: SessionContext,
    family: string = randomUUID(),
  ): Promise<TokenPair & { sessionId: string }> {
    const refreshToken = randomBytes(48).toString('base64url');
    const sessionId = randomUUID();
    const ttlDays = this.config.get<number>('refreshTokenTtlDays', 30);
    await m.query(
      `INSERT INTO auth_sessions(id,user_id,device_id,refresh_token_hash,token_family,user_agent,ip_address,last_used_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()+($8||' days')::interval)`,
      [
        sessionId,
        user.id,
        deviceId,
        this.hashToken(refreshToken),
        family,
        context.userAgent,
        context.ipAddress,
        String(ttlDays),
      ],
    );
    const expiresIn = this.config.get<number>('accessTokenTtlSeconds', 900);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, role: user.role, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('jwtAccessSecret'),
        issuer: this.config.getOrThrow<string>('jwtIssuer'),
        audience: this.config.getOrThrow<string>('jwtAudience'),
        expiresIn,
      },
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn, sessionId };
  }
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private publicUser(user: UserRow): CurrentUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }
}
