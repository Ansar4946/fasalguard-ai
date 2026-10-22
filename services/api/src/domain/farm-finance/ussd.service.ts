import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { DataSource, type EntityManager } from 'typeorm';
import type { UssdCallbackDto } from './dto/farm-finance.dto';
import type { UssdDemoCallbackDto } from './dto/farm-finance.dto';
import { ExpenseCategory, UssdState } from './farm-finance.enums';
import { UssdGatewayVerifier } from './ussd-gateway-verifier';

interface SessionRow {
  id: string;
  user_id: string;
  phone_hash: string;
  state: UssdState;
  context: Record<string, unknown>;
  expires_at: Date;
  completed_at: Date | null;
  terminal_response: string | null;
  step_count: number;
}
interface CallbackRow {
  request_hash: string;
  response_text: string | null;
}

const USSD_LOCK_RETRIES = 3;
/** PostgreSQL lock_not_available (lock_timeout) and deadlock_detected. */
function isTransientLockError(error: unknown): boolean {
  const e = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = e?.driverError?.code ?? e?.code;
  return code === '55P03' || code === '40P01';
}

const categories = Object.values(ExpenseCategory);
const categoryMenu = categories.map((x, i) => `${i + 1}. ${title(x)}`).join('\n');

@Injectable()
export class UssdService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly verifier: UssdGatewayVerifier,
  ) {}

  async callback(dto: UssdCallbackDto, timestamp?: string, signature?: string): Promise<string> {
    const canonical = this.verifier.verify(dto, timestamp, signature);
    const requestHash = createHash('sha256').update(canonical).digest('hex');
    const gateway = this.config.get<string>('ussdGateway', 'contract-test');
    return this.processCallback(
      gateway,
      dto,
      requestHash,
      this.config.getOrThrow<string>('ussdCallbackSecret'),
    );
  }

  async demoCallback(userId: string, dto: UssdDemoCallbackDto): Promise<{ text: string }> {
    if (!this.config.get<boolean>('ussdDemoEnabled', false))
      throw new ServiceUnavailableException({
        code: 'USSD_DEMO_DISABLED',
        message: 'The USSD simulator is unavailable.',
      });
    const users: Array<{ phone: string | null }> = await this.db.query(
      `SELECT phone FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL`,
      [userId],
    );
    const phone = users[0]?.phone;
    if (!phone)
      throw new BadRequestException({
        code: 'VERIFIED_PHONE_REQUIRED',
        message: 'Add a phone number to use the USSD simulator.',
      });
    const callback: UssdCallbackDto = { ...dto, phoneNumber: phone };
    const canonical = UssdGatewayVerifier.canonical(callback);
    const requestHash = createHash('sha256').update(canonical).digest('hex');
    const text = await this.processCallback(
      'demo-web',
      callback,
      requestHash,
      this.config.getOrThrow<string>('jwtAccessSecret'),
      userId,
    );
    return { text };
  }

  private async processCallback(
    gateway: string,
    dto: UssdCallbackDto,
    requestHash: string,
    phoneHashSecret: string,
    expectedUserId?: string,
  ): Promise<string> {
    // Parallel callbacks for one session queue on the session row lock. A caller that waits longer than
    // lock_timeout (or loses a deadlock) retries in a fresh transaction, where it sees the finished
    // session/receipt and returns the stored result; if the session stays busy it gets a clean 409.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.processCallbackOnce(
          gateway,
          dto,
          requestHash,
          phoneHashSecret,
          expectedUserId,
        );
      } catch (error) {
        if (!isTransientLockError(error)) throw error;
        if (attempt >= USSD_LOCK_RETRIES)
          throw new ConflictException({
            code: 'USSD_SESSION_BUSY',
            message: 'The USSD session is busy. Retry the same callback.',
          });
      }
    }
  }

  private async processCallbackOnce(
    gateway: string,
    dto: UssdCallbackDto,
    requestHash: string,
    phoneHashSecret: string,
    expectedUserId?: string,
  ): Promise<string> {
    const result = await this.db.transaction(async (tx) => {
      await tx.query(`SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='8s'`);
      const inserted: Array<{ id: string }> = await tx.query(
        `INSERT INTO ussd_callback_receipts(gateway,provider_event_id,provider_session_id,request_hash,status)
         VALUES($1,$2,$3,$4,'PROCESSING') ON CONFLICT(gateway,provider_event_id) DO NOTHING RETURNING id`,
        [gateway, dto.eventId, dto.sessionId, requestHash],
      );
      if (!inserted[0]) {
        const prior: CallbackRow[] = await tx.query(
          `SELECT request_hash,response_text FROM ussd_callback_receipts
           WHERE gateway=$1 AND provider_event_id=$2 FOR UPDATE`,
          [gateway, dto.eventId],
        );
        if (!prior[0] || prior[0].request_hash !== requestHash) {
          await this.securityEvent(tx, gateway, dto, 'EVENT_PAYLOAD_CONFLICT', requestHash);
          return { response: '', conflict: true };
        }
        if (prior[0].response_text) return { response: prior[0].response_text, conflict: false };
        throw new ConflictException({
          code: 'USSD_EVENT_IN_PROGRESS',
          message: 'Callback in progress.',
        });
      }

      const response = await this.advance(
        tx,
        gateway,
        dto,
        requestHash,
        phoneHashSecret,
        expectedUserId,
      );
      await tx.query(
        `UPDATE ussd_callback_receipts SET status='APPLIED',response_text=$3,processed_at=now()
         WHERE gateway=$1 AND provider_event_id=$2`,
        [gateway, dto.eventId, response],
      );
      return { response, conflict: false };
    });
    if (result.conflict)
      throw new ConflictException({
        code: 'USSD_EVENT_CONFLICT',
        message: 'The callback event does not match its original payload.',
      });
    return result.response;
  }

  private async advance(
    tx: EntityManager,
    gateway: string,
    dto: UssdCallbackDto,
    requestHash: string,
    phoneHashSecret: string,
    expectedUserId?: string,
  ): Promise<string> {
    const phoneHash = createHmac('sha256', phoneHashSecret).update(dto.phoneNumber).digest('hex');
    const sessions: SessionRow[] = await tx.query(
      `SELECT id,user_id,phone_hash,state,context,expires_at,completed_at,terminal_response,step_count
       FROM ussd_sessions WHERE gateway=$1 AND provider_session_id=$2 FOR UPDATE`,
      [gateway, dto.sessionId],
    );
    let session = sessions[0];
    if (!session) return this.start(tx, gateway, dto, phoneHash, expectedUserId);
    if (session.phone_hash !== phoneHash) {
      await this.securityEvent(tx, gateway, dto, 'PHONE_SESSION_MISMATCH', requestHash);
      return 'END Unable to continue this session.';
    }
    if (session.completed_at || [UssdState.Complete, UssdState.Cancelled].includes(session.state))
      return session.terminal_response ?? 'END Session closed.';
    if (new Date(session.expires_at) <= new Date())
      return this.finish(tx, session.id, UssdState.Cancelled, 'END Session expired.');
    if (session.step_count >= 20)
      return this.finish(tx, session.id, UssdState.Cancelled, 'END Session limit reached.');
    if (dto.input === '0')
      return this.finish(tx, session.id, UssdState.Cancelled, 'END Cancelled. No expense saved.');
    await tx.query(
      `UPDATE ussd_sessions SET step_count=step_count+1,updated_at=now() WHERE id=$1`,
      [session.id],
    );
    session = { ...session, step_count: session.step_count + 1 };

    switch (session.state) {
      case UssdState.Pin:
        return this.pin(tx, session, dto.input);
      case UssdState.Farm:
        return this.farm(tx, session, dto.input);
      case UssdState.Season:
        return this.season(tx, session, dto.input);
      case UssdState.Category:
        return this.category(tx, session, dto.input);
      case UssdState.Amount:
        return this.amount(tx, session, dto.input);
      case UssdState.Date:
        return this.date(tx, session, dto.input);
      case UssdState.Review:
        return this.confirm(tx, session, dto.input);
      default:
        return this.finish(tx, session.id, UssdState.Cancelled, 'END Session closed.');
    }
  }

  private async start(
    tx: EntityManager,
    gateway: string,
    dto: UssdCallbackDto,
    phoneHash: string,
    expectedUserId?: string,
  ): Promise<string> {
    if (dto.input !== '') return 'END Start a new session.';
    const users: Array<{ id: string }> = await tx.query(
      `SELECT u.id FROM users u JOIN farmer_profiles fp ON fp.user_id=u.id
       JOIN ussd_credentials c ON c.user_id=u.id
       WHERE u.phone=$1 AND ($2::uuid IS NULL OR u.id=$2) AND u.status='active' AND u.deleted_at IS NULL LIMIT 2`,
      [dto.phoneNumber, expectedUserId ?? null],
    );
    if (users.length !== 1) return 'END Service unavailable for this number.';
    const id = randomUUID();
    const ttl = this.config.get<number>('ussdSessionTtlSeconds', 300);
    await tx.query(
      `INSERT INTO ussd_sessions(id,gateway,provider_session_id,user_id,phone_hash,state,context,expires_at)
       VALUES($1,$2,$3,$4,$5,'PIN','{}',now()+($6||' seconds')::interval)`,
      [id, gateway, dto.sessionId, users[0]!.id, phoneHash, String(ttl)],
    );
    return 'CON Enter your Fasal Guard PIN\n0. Cancel';
  }

  private async pin(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    if (!/^\d{4,6}$/.test(input)) return 'CON Invalid PIN format. Try again\n0. Cancel';
    const rows: Array<{
      pin_hash: string;
      failed_attempts: number;
      locked_until: Date | null;
      version: number;
    }> = await tx.query(
      `SELECT pin_hash,failed_attempts,locked_until,version FROM ussd_credentials WHERE user_id=$1 FOR UPDATE`,
      [s.user_id],
    );
    const credential = rows[0];
    if (!credential || (credential.locked_until && new Date(credential.locked_until) > new Date()))
      return this.finish(tx, s.id, UssdState.Cancelled, 'END Unable to authenticate.');
    const valid = await argon2.verify(credential.pin_hash, input);
    if (!valid) {
      const max = this.config.get<number>('ussdPinMaxAttempts', 5);
      const next = credential.failed_attempts + 1;
      if (next >= max) {
        const lock = this.config.get<number>('ussdPinLockSeconds', 900);
        await tx.query(
          `UPDATE ussd_credentials SET failed_attempts=$2,locked_until=now()+($3||' seconds')::interval,updated_at=now(),version=version+1 WHERE user_id=$1`,
          [s.user_id, next, String(lock)],
        );
        return this.finish(tx, s.id, UssdState.Cancelled, 'END Unable to authenticate.');
      }
      await tx.query(
        `UPDATE ussd_credentials SET failed_attempts=$2,updated_at=now(),version=version+1 WHERE user_id=$1`,
        [s.user_id, next],
      );
      return `CON Incorrect PIN. ${max - next} attempt(s) remaining\n0. Cancel`;
    }
    await tx.query(
      `UPDATE ussd_credentials SET failed_attempts=0,locked_until=NULL,updated_at=now(),version=version+1 WHERE user_id=$1`,
      [s.user_id],
    );
    const farms: Array<{ id: string; name: string }> = await tx.query(
      `SELECT f.id,f.name FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id
       WHERE fp.user_id=$1 AND f.deleted_at IS NULL AND f.status='active' ORDER BY f.name,id LIMIT 9`,
      [s.user_id],
    );
    if (!farms.length)
      return this.finish(tx, s.id, UssdState.Cancelled, 'END No active farms found.');
    await this.move(tx, s.id, UssdState.Farm, {
      farms,
      credentialVersion: credential.version + 1,
    });
    return `CON Select farm\n${farms.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}\n0. Cancel`;
  }

  private async farm(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    const farms = arrayContext<{ id: string; name: string }>(s.context.farms);
    const farm = select(farms, input);
    if (!farm) return 'CON Invalid farm selection\n0. Cancel';
    const seasons: Array<{ id: string; label: string }> = await tx.query(
      `SELECT cc.id,(c.name||' - '||coalesce(cc.sowing_date::text,'current')) label
       FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id JOIN farms f ON f.id=fi.farm_id
       JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN crops c ON c.id=cc.crop_id
       WHERE fp.user_id=$1 AND f.id=$2 AND cc.status IN('planned','active')
       AND cc.deleted_at IS NULL AND fi.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY label,cc.id LIMIT 9`,
      [s.user_id, farm.id],
    );
    if (!seasons.length)
      return this.finish(tx, s.id, UssdState.Cancelled, 'END No active crop seasons found.');
    await this.move(tx, s.id, UssdState.Season, { ...s.context, farm, seasons });
    return `CON Select crop season\n${seasons.map((x, i) => `${i + 1}. ${x.label}`).join('\n')}\n0. Cancel`;
  }

  private async season(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    const season = select(arrayContext<{ id: string; label: string }>(s.context.seasons), input);
    if (!season) return 'CON Invalid crop season selection\n0. Cancel';
    await this.move(tx, s.id, UssdState.Category, { ...s.context, season });
    return `CON Select expense category\n${categoryMenu}\n0. Cancel`;
  }

  private async category(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    const category = select(categories, input);
    if (!category) return `CON Invalid category\n${categoryMenu}\n0. Cancel`;
    await this.move(tx, s.id, UssdState.Amount, { ...s.context, category });
    return 'CON Enter whole PKR amount\n0. Cancel';
  }

  private async amount(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    if (!/^[1-9]\d{0,8}$/.test(input)) return 'CON Enter a valid whole PKR amount\n0. Cancel';
    const minor = Number(input) * 100;
    const max = this.config.get<number>('ussdMaxAmountMinor', 100_000_000);
    if (!Number.isSafeInteger(minor) || minor > max)
      return 'CON Amount exceeds the allowed limit\n0. Cancel';
    await this.move(tx, s.id, UssdState.Date, { ...s.context, amountMinor: minor });
    return 'CON Expense date\n1. Today\n0. Cancel';
  }

  private async date(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    if (input !== '1') return 'CON Select 1 for today\n0. Cancel';
    const occurredOn = pakistanDate();
    const context = { ...s.context, occurredOn };
    await this.move(tx, s.id, UssdState.Review, context);
    return review(context);
  }

  private async confirm(tx: EntityManager, s: SessionRow, input: string): Promise<string> {
    if (input === '2')
      return this.finish(tx, s.id, UssdState.Cancelled, 'END Cancelled. No expense saved.');
    if (input !== '1') return review(s.context);
    const farm = objectContext<{ id: string; name: string }>(s.context.farm);
    const season = objectContext<{ id: string; label: string }>(s.context.season);
    const category = String(s.context.category);
    const amountMinor = Number(s.context.amountMinor);
    const occurredOn = String(s.context.occurredOn);
    const owned: Array<{ farmer_id: string; credential_version: number }> = await tx.query(
      `SELECT fp.id farmer_id,uc.version credential_version FROM farmer_profiles fp
       JOIN ussd_credentials uc ON uc.user_id=fp.user_id JOIN farms f ON f.farmer_id=fp.id
       JOIN fields fi ON fi.farm_id=f.id JOIN crop_cycles cc ON cc.field_id=fi.id
       WHERE fp.user_id=$1 AND f.id=$2 AND cc.id=$3 AND f.deleted_at IS NULL
       AND fi.deleted_at IS NULL AND cc.deleted_at IS NULL AND f.status='active'
       AND cc.status IN('planned','active') FOR UPDATE OF f,fi,cc`,
      [s.user_id, farm.id, season.id],
    );
    if (!owned[0] || owned[0].credential_version !== Number(s.context.credentialVersion))
      return this.finish(
        tx,
        s.id,
        UssdState.Cancelled,
        'END Authorization changed. Nothing saved.',
      );
    const entryId = randomUUID();
    const reference = `ussd:${s.id}`;
    const inserted: Array<{ id: string }> = await tx.query(
      `INSERT INTO farm_ledger_entries(id,user_id,farmer_id,farm_id,crop_cycle_id,type,category,
       amount_minor,currency,occurred_on,channel,source_session_id,client_reference,confirmed_at)
       VALUES($1,$2,$3,$4,$5,'EXPENSE',$6,$7,'PKR',$8,'USSD',$9,$10,now())
       ON CONFLICT(source_session_id) DO NOTHING RETURNING id`,
      [
        entryId,
        s.user_id,
        owned[0].farmer_id,
        farm.id,
        season.id,
        category,
        amountMinor,
        occurredOn,
        s.id,
        reference,
      ],
    );
    const finalId =
      inserted[0]?.id ??
      (
        await tx.query<Array<{ id: string }>>(
          `SELECT id FROM farm_ledger_entries WHERE source_session_id=$1`,
          [s.id],
        )
      )[0]!.id;
    if (inserted[0])
      await tx.query(
        `INSERT INTO farm_ledger_events(ledger_entry_id,user_id,type,payload)
         VALUES($1,$2,'CONFIRMED',jsonb_build_object('channel','USSD'))`,
        [finalId, s.user_id],
      );
    return this.finish(tx, s.id, UssdState.Complete, `END Expense saved. Receipt ${finalId}`);
  }

  private async move(
    tx: EntityManager,
    id: string,
    state: UssdState,
    context: Record<string, unknown>,
  ): Promise<void> {
    await tx.query(
      `UPDATE ussd_sessions SET state=$2,context=$3::jsonb,updated_at=now() WHERE id=$1`,
      [id, state, JSON.stringify(context)],
    );
  }

  private async finish(
    tx: EntityManager,
    id: string,
    state: UssdState,
    response: string,
  ): Promise<string> {
    await tx.query(
      `UPDATE ussd_sessions SET state=$2,terminal_response=$3,completed_at=now(),updated_at=now() WHERE id=$1`,
      [id, state, response],
    );
    return response;
  }

  private async securityEvent(
    tx: EntityManager,
    gateway: string,
    dto: UssdCallbackDto,
    type: 'EVENT_PAYLOAD_CONFLICT' | 'PHONE_SESSION_MISMATCH',
    requestHash: string,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO ussd_security_events(gateway,provider_session_id,provider_event_id,type,request_hash)
       VALUES($1,$2,$3,$4,$5)`,
      [gateway, dto.sessionId, dto.eventId, type, requestHash],
    );
  }
}

function select<T>(values: T[], input: string): T | undefined {
  if (!/^[1-9]$/.test(input)) return undefined;
  return values[Number(input) - 1];
}
function arrayContext<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function objectContext<T>(value: unknown): T {
  return (value && typeof value === 'object' ? value : {}) as T;
}
function title(value: string): string {
  return value[0] + value.slice(1).toLowerCase();
}
function pakistanDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function review(context: Record<string, unknown>): string {
  const farm = objectContext<{ name?: string }>(context.farm);
  const season = objectContext<{ label?: string }>(context.season);
  const category = typeof context.category === 'string' ? context.category : '';
  const occurredOn = typeof context.occurredOn === 'string' ? context.occurredOn : '';
  return `CON Review expense\nFarm: ${farm.name ?? ''}\nSeason: ${season.label ?? ''}\nCategory: ${title(category)}\nAmount: PKR ${Number(context.amountMinor ?? 0) / 100}\nDate: ${occurredOn}\n1. Confirm\n2. Cancel`;
}
