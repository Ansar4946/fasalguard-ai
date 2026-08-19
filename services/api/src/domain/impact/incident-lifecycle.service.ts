import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IncidentState, VerificationStatus } from '../digital-twin/digital-twin.enums';
import { captureFieldSnapshot } from './incident-snapshot';
import type {
  ConfirmIncidentDto,
  ExpertConfirmIncidentDto,
  RecordFollowUpDto,
} from './dto/impact.dto';
/* TypeORM raw query results are constrained by each explicit SQL projection below. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

interface IncidentOwnerRow {
  id: string;
  fieldId: string | null;
  state: IncidentState;
  confidence: number | null;
  resolvedAt: Date | null;
}

@Injectable()
export class IncidentLifecycleService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private async ownedIncident(
    userId: string,
    farmId: string,
    incidentId: string,
  ): Promise<IncidentOwnerRow> {
    const rows: IncidentOwnerRow[] = await this.db.query(
      `SELECT i.id,i.field_id "fieldId",i.state,i.confidence,i.resolved_at "resolvedAt"
       FROM farm_incidents i JOIN farms fa ON fa.id=i.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id
       WHERE i.id=$1 AND i.farm_id=$2 AND fp.user_id=$3 AND fa.deleted_at IS NULL`,
      [incidentId, farmId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Farm incident was not found.');
    return rows[0];
  }

  async confirmIncident(
    userId: string,
    farmId: string,
    incidentId: string,
    dto: ConfirmIncidentDto,
  ): Promise<unknown> {
    await this.ownedIncident(userId, farmId, incidentId);
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<
      [Array<{ id: string; farmerConfirmed: boolean; farmerConfirmedAt: Date }>, number]
    >(
      `UPDATE farm_incidents SET farmer_confirmed=$1,farmer_confirmed_at=now(),updated_at=now(),version=version+1
       WHERE id=$2 RETURNING id,farmer_confirmed "farmerConfirmed",farmer_confirmed_at "farmerConfirmedAt"`,
      [dto.confirmed, incidentId],
    );
    return rows[0];
  }

  async expertConfirmIncident(
    adminUserId: string,
    incidentId: string,
    dto: ExpertConfirmIncidentDto,
  ): Promise<unknown> {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<
      [Array<{ id: string; expertConfirmed: boolean; expertConfirmedAt: Date }>, number]
    >(
      `UPDATE farm_incidents
       SET expert_confirmed=$1,expert_confirmed_at=now(),expert_confirmed_by=$2,
           evidence_references=evidence_references||jsonb_build_array(jsonb_build_object('type','EXPERT_REVIEW_NOTE','confirmed',$1,'notes',$3::text,'reviewedBy',$2::text,'at',now())),
           updated_at=now(),version=version+1
       WHERE id=$4 RETURNING id,expert_confirmed "expertConfirmed",expert_confirmed_at "expertConfirmedAt"`,
      [dto.confirmed, adminUserId, dto.notes ?? null, incidentId],
    );
    if (!rows[0]) throw new NotFoundException('Farm incident was not found.');
    return rows[0];
  }

  async startIntervention(
    userId: string,
    farmId: string,
    interventionId: string,
  ): Promise<unknown> {
    const owner: Array<{ id: string; status: string }> = await this.db.query(
      `SELECT x.id,x.status FROM farm_interventions x JOIN farms fa ON fa.id=x.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id
       WHERE x.id=$1 AND x.farm_id=$2 AND fp.user_id=$3`,
      [interventionId, farmId, userId],
    );
    if (!owner[0]) throw new NotFoundException('Farm intervention was not found.');
    if (owner[0].status !== 'PLANNED')
      throw new BadRequestException('Only a planned action can be started.');
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<
      [Array<{ id: string; status: string; startedAt: Date }>, number]
    >(
      `UPDATE farm_interventions SET status='IN_PROGRESS',started_at=now(),updated_at=now(),version=version+1
       WHERE id=$1 RETURNING id,status,started_at "startedAt"`,
      [interventionId],
    );
    return rows[0];
  }

  async recordFollowUp(
    userId: string,
    farmId: string,
    incidentId: string,
    dto: RecordFollowUpDto,
  ): Promise<unknown> {
    const incident = await this.ownedIncident(userId, farmId, incidentId);
    if (!dto.cropScanId && !dto.satelliteCaptureId && !dto.fieldInspectionId)
      throw new BadRequestException(
        'At least one real evidence reference (crop scan, satellite capture, or field inspection) is required.',
      );

    if (dto.cropScanId) {
      const ok: Array<{ id: string }> = await this.db.query(
        `SELECT id FROM crop_scans WHERE id=$1 AND owner_id=$2`,
        [dto.cropScanId, userId],
      );
      if (!ok[0]) throw new ForbiddenException('The referenced crop scan does not belong to you.');
    }
    if (dto.satelliteCaptureId) {
      const ok: Array<{ id: string }> = await this.db.query(
        `SELECT sc.id FROM satellite_captures sc JOIN fields fi ON fi.id=sc.field_id JOIN farms fa ON fa.id=fi.farm_id
         WHERE sc.id=$1 AND fa.id=$2`,
        [dto.satelliteCaptureId, farmId],
      );
      if (!ok[0])
        throw new ForbiddenException(
          'The referenced satellite capture does not belong to this farm.',
        );
    }
    if (dto.fieldInspectionId) {
      const ok: Array<{ id: string }> = await this.db.query(
        `SELECT id FROM field_inspections WHERE id=$1 AND user_id=$2`,
        [dto.fieldInspectionId, userId],
      );
      if (!ok[0])
        throw new ForbiddenException('The referenced field inspection does not belong to you.');
    }

    const snapshot = await captureFieldSnapshot(this.db, incident.fieldId);
    const riskRows: Array<{ score: number }> = incident.fieldId
      ? await this.db.query(
          `SELECT score FROM field_risk_assessments WHERE field_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [incident.fieldId],
        )
      : [];
    const followUpRiskScore = riskRows[0] ? riskRows[0].score / 100 : null;

    const nextState =
      dto.status === VerificationStatus.Improved
        ? IncidentState.Resolved
        : dto.status === VerificationStatus.Worsened
          ? IncidentState.Escalated
          : incident.state;
    const nextResolvedAt = nextState === IncidentState.Resolved ? new Date() : incident.resolvedAt;

    const result = await this.db.transaction(async (tx) => {
      const verification = await tx.query(
        `INSERT INTO farm_verifications(farm_id,field_id,incident_id,crop_scan_id,satellite_capture_id,field_inspection_id,status,outcome,observed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING id,status,observed_at "observedAt"`,
        [
          farmId,
          incident.fieldId,
          incidentId,
          dto.cropScanId ?? null,
          dto.satelliteCaptureId ?? null,
          dto.fieldInspectionId ?? null,
          dto.status,
          dto.outcome ?? null,
        ],
      );
      await tx.query(
        `UPDATE farm_incidents SET
           follow_up_risk_score=$1,follow_up_vegetation_score=$2,follow_up_affected_area_hectares=$3,
           state=$4,resolved_at=$5,
           updated_at=now(),version=version+1
         WHERE id=$6`,
        [
          followUpRiskScore,
          snapshot.vegetationScore,
          snapshot.affectedAreaHectares,
          nextState,
          nextResolvedAt,
          incidentId,
        ],
      );
      return verification[0];
    });
    return result;
  }
}
