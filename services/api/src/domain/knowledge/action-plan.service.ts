import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActionStepType } from './knowledge.enums';
interface Guideline {
  id: string;
  guideline_version: number;
  immediate_actions: string[];
  preventive_actions: string[];
  monitoring_actions: string[];
  expert_escalation_criteria: string[];
  chemical_guidance: Record<string, unknown> | null;
  chemical_guidance_approved: boolean;
}
@Injectable()
export class ActionPlanService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async generate(userId: string, scanId: string): Promise<unknown> {
    const context = (
      await this.db.query<
        Array<{ cropId: string | null; condition: string | null; severity: string | null }>
      >(
        `SELECT cc.crop_id AS "cropId",d.screened_condition AS condition,sa.severity FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN LATERAL(SELECT severity FROM severity_assessments x WHERE x.scan_id=cs.id ORDER BY generated_at DESC LIMIT 1)sa ON true WHERE cs.id=$1 AND cs.owner_id=$2`,
        [scanId, userId],
      )
    )[0];
    if (!context) throw new NotFoundException('Crop scan was not found.');
    const guideline = (
      await this.db.query<Guideline[]>(
        `SELECT * FROM treatment_guidelines WHERE status='APPROVED' AND approved_at IS NOT NULL AND (review_due_at IS NULL OR review_due_at>now()) AND crop_id=$1 AND (lower(condition)=lower($2) OR condition='GENERIC_CROP_HEALTH_CONCERN') AND (severity IS NULL OR severity=$3) ORDER BY CASE WHEN lower(condition)=lower($2) THEN 0 ELSE 1 END,guideline_version DESC LIMIT 1`,
        [context.cropId, context.condition ?? '', context.severity],
      )
    )[0];
    if (!guideline)
      throw new NotFoundException({
        code: 'NO_APPROVED_GUIDANCE',
        message: 'No current approved guidance is available. Request expert review.',
      });
    const groups: Array<[ActionStepType, string, string[]]> = [
      [ActionStepType.Immediate, 'immediate_actions', guideline.immediate_actions],
      [ActionStepType.Preventive, 'preventive_actions', guideline.preventive_actions],
      [ActionStepType.Monitoring, 'monitoring_actions', guideline.monitoring_actions],
      [
        ActionStepType.ExpertEscalation,
        'expert_escalation_criteria',
        guideline.expert_escalation_criteria,
      ],
    ];
    if (guideline.chemical_guidance && guideline.chemical_guidance_approved)
      groups.push([
        ActionStepType.Chemical,
        'chemical_guidance',
        Object.values(guideline.chemical_guidance).filter(
          (x): x is string => typeof x === 'string',
        ),
      ]);
    const runner = this.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const planRows = (await runner.query(
        `INSERT INTO action_plans(scan_id,guideline_id,guideline_version,created_for_user_id,severity,generated_at)VALUES($1,$2,$3,$4,$5,now())RETURNING id`,
        [scanId, guideline.id, guideline.guideline_version, userId, context.severity ?? 'UNKNOWN'],
      )) as Array<{ id: string }>;
      const plan = planRows[0]!;
      let order = 1;
      for (const [type, field, steps] of groups)
        for (const instruction of steps)
          await runner.query(
            `INSERT INTO action_plan_steps(action_plan_id,type,instruction,display_order,source_guideline_id,source_field)VALUES($1,$2,$3,$4,$5,$6)`,
            [plan.id, type, instruction, order++, guideline.id, field],
          );
      await runner.commitTransaction();
      return this.get(userId, plan.id);
    } catch (error: unknown) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
  async get(userId: string, id: string): Promise<unknown> {
    const rows = await this.db.query<unknown[]>(
      `SELECT ap.*,COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'type',s.type,'instruction',s.instruction,'displayOrder',s.display_order,'sourceGuidelineId',s.source_guideline_id,'sourceField',s.source_field)ORDER BY s.display_order)FILTER(WHERE s.id IS NOT NULL),'[]')steps FROM action_plans ap JOIN crop_scans cs ON cs.id=ap.scan_id LEFT JOIN action_plan_steps s ON s.action_plan_id=ap.id WHERE ap.id=$1 AND cs.owner_id=$2 GROUP BY ap.id`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('Action plan was not found.');
    return rows[0];
  }
}
