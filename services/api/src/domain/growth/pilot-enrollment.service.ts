import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConsentType, UserRole } from '../identity/identity.enums';
import { PilotEnrollmentStatus } from './growth.enums';
/* TypeORM raw query results are constrained by each explicit SQL projection below. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const PILOT_CONSENT_POLICY_VERSION = 'PILOT-1';

@Injectable()
export class PilotEnrollmentService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async invite(adminUserId: string, userId: string, organizationId?: string): Promise<unknown> {
    const target: Array<{ id: string; source: string }> = await this.db.query(
      `SELECT u.id,fp.acquisition_source "source" FROM users u
       JOIN farmer_profiles fp ON fp.user_id=u.id
       WHERE u.id=$1 AND u.role=$2 AND u.deleted_at IS NULL`,
      [userId, UserRole.Farmer],
    );
    if (!target[0])
      throw new NotFoundException('Target user was not found or is not an active farmer.');

    const existing: Array<{ id: string }> = await this.db.query(
      organizationId
        ? `SELECT id FROM pilot_users WHERE user_id=$1 AND organization_id=$2`
        : `SELECT id FROM pilot_users WHERE user_id=$1 AND organization_id IS NULL`,
      organizationId ? [userId, organizationId] : [userId],
    );
    if (existing[0]) throw new ConflictException('This user already has a pilot enrollment.');

    const rows = await this.db.query(
      `INSERT INTO pilot_users(organization_id,user_id,status,invited_at,invited_by,source)
       VALUES($1,$2,$3,now(),$4,$5) RETURNING id,status,invited_at "invitedAt"`,
      [
        organizationId ?? null,
        userId,
        PilotEnrollmentStatus.Invited,
        adminUserId,
        target[0].source ?? null,
      ],
    );
    return rows[0];
  }

  async respondToInvite(userId: string, accepted: boolean): Promise<unknown> {
    const rows: Array<{ id: string; status: PilotEnrollmentStatus }> = await this.db.query(
      `SELECT id,status FROM pilot_users WHERE user_id=$1 ORDER BY invited_at DESC LIMIT 1`,
      [userId],
    );
    const enrollment = rows[0];
    if (!enrollment) throw new NotFoundException('No pilot invitation was found for you.');
    if (enrollment.status !== PilotEnrollmentStatus.Invited)
      throw new BadRequestException('This pilot invitation has already been responded to.');

    if (accepted) {
      return this.db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO consents(user_id,type,policy_version,granted,recorded_at) VALUES($1,$2,$3,true,now())`,
          [userId, ConsentType.ResearchDataUse, PILOT_CONSENT_POLICY_VERSION],
        );
        // DataSource.query() for an UPDATE...RETURNING (even inside a transaction/manager)
        // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
        const [updated] = await tx.query<
          [Array<{ id: string; status: string; registeredAt: Date }>, number]
        >(
          `UPDATE pilot_users SET status=$1,registered_at=now(),updated_at=now(),version=version+1 WHERE id=$2
           RETURNING id,status,registered_at "registeredAt"`,
          [PilotEnrollmentStatus.Registered, enrollment.id],
        );
        return updated[0];
      });
    }
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [updated] = await this.db.query<
      [Array<{ id: string; status: string; droppedAt: Date }>, number]
    >(
      `UPDATE pilot_users SET status=$1,dropped_at=now(),updated_at=now(),version=version+1 WHERE id=$2
       RETURNING id,status,dropped_at "droppedAt"`,
      [PilotEnrollmentStatus.Dropped, enrollment.id],
    );
    return updated[0];
  }

  async complete(_adminUserId: string, enrollmentId: string): Promise<unknown> {
    const [rows] = await this.db.query<
      [Array<{ id: string; status: string; completedAt: Date }>, number]
    >(
      `UPDATE pilot_users SET status=$1,completed_at=now(),updated_at=now(),version=version+1
       WHERE id=$2 AND status NOT IN($3,$4) RETURNING id,status,completed_at "completedAt"`,
      [
        PilotEnrollmentStatus.Completed,
        enrollmentId,
        PilotEnrollmentStatus.Completed,
        PilotEnrollmentStatus.Dropped,
      ],
    );
    if (!rows[0])
      throw new NotFoundException('Pilot enrollment was not found or is already closed out.');
    return rows[0];
  }

  async drop(_adminUserId: string, enrollmentId: string): Promise<unknown> {
    const [rows] = await this.db.query<
      [Array<{ id: string; status: string; droppedAt: Date }>, number]
    >(
      `UPDATE pilot_users SET status=$1,dropped_at=now(),updated_at=now(),version=version+1
       WHERE id=$2 AND status NOT IN($3,$4) RETURNING id,status,dropped_at "droppedAt"`,
      [
        PilotEnrollmentStatus.Dropped,
        enrollmentId,
        PilotEnrollmentStatus.Completed,
        PilotEnrollmentStatus.Dropped,
      ],
    );
    if (!rows[0])
      throw new NotFoundException('Pilot enrollment was not found or is already closed out.');
    return rows[0];
  }

  async list(): Promise<unknown[]> {
    return this.db.query(
      `SELECT pu.id,pu.status,pu.source,pu.invited_at "invitedAt",pu.registered_at "registeredAt",
        pu.onboarded_at "onboardedAt",pu.activated_at "activatedAt",pu.completed_at "completedAt",
        pu.dropped_at "droppedAt",pu.organization_id "organizationId",
        u.id "userId",u.email,fp.full_name "fullName"
       FROM pilot_users pu
       JOIN users u ON u.id=pu.user_id
       LEFT JOIN farmer_profiles fp ON fp.user_id=u.id
       WHERE u.is_test_account=false
       ORDER BY pu.invited_at DESC LIMIT 500`,
    );
  }
}
