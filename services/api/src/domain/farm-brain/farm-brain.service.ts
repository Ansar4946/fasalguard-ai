import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { EntitlementMetric } from '../billing/billing.enums';
import { EntitlementService } from '../billing/entitlement.service';
import { FarmDigitalTwinService } from '../digital-twin/farm-digital-twin.service';
import { LifecycleEmailService } from '../growth/lifecycle-email.service';
import { IncidentState } from '../digital-twin/digital-twin.enums';
import { NotificationCategory, TaskSource } from '../notifications/notification.enums';
import { NotificationService } from '../notifications/notification.service';
import { MetricsService } from '../../observability/metrics.service';
import {
  FarmBrainRunStatus,
  FarmBrainToolCallStatus,
  FarmBrainToolName,
  FarmHealthStatus,
} from './farm-brain.enums';
import { isMutationTool } from './farm-brain.schema';
import { FARM_BRAIN_SCHEMA_VERSION, type FarmBrainInput } from './farm-brain.types';
import {
  FARM_REASONING_PROVIDER,
  type FarmReasoningProvider,
} from './providers/farm-reasoning.provider';

export const FARM_BRAIN_QUEUE = 'farm-brain';
export interface FarmBrainJob {
  runId: string;
}
interface RunRow {
  id: string;
  userId: string;
  farmId: string;
  fieldId: string | null;
  status: FarmBrainRunStatus;
  inputManifest: FarmBrainInput;
  result: Record<string, unknown> | null;
  provider?: string | null;
  modelId?: string | null;
  modelVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  createdAt?: Date;
  completedAt?: Date | null;
}

@Injectable()
export class FarmBrainService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(FARM_BRAIN_QUEUE) private readonly queue: Queue<FarmBrainJob>,
    private readonly twins: FarmDigitalTwinService,
    private readonly notifications: NotificationService,
    private readonly entitlements: EntitlementService,
    private readonly lifecycle: LifecycleEmailService,
    @Inject(FARM_REASONING_PROVIDER) private readonly provider: FarmReasoningProvider,
    private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  async start(userId: string, farmId: string, fieldId?: string): Promise<unknown> {
    const snapshot = await this.twins.getSnapshot(userId, farmId, {
      days: 30,
      includeGeometry: false,
      fieldId,
    });
    const input = toFarmBrainInput(snapshot);
    assertPrivacyBoundary(input);
    const hashProjection = { ...input, generatedAt: '', dataFreshness: {} };
    const inputHash = sha256(
      `${userId}:${farmId}:${fieldId ?? ''}:${canonicalJson(hashProjection)}`,
    );
    const evidence = evidenceManifest(input);
    const inserted = await this.db.transaction(async (tx) => {
      const existing: Array<{ id: string; status: string }> = await tx.query(
        `SELECT id,status FROM farm_brain_runs WHERE user_id=$1 AND farm_id=$2 AND input_hash=$3 AND status IN('QUEUED','RUNNING','COMPLETED') LIMIT 1`,
        [userId, farmId, inputHash],
      );
      if (existing[0]) return { ...existing[0], created: false };
      const monthlyRuns: Array<{ count: string }> = await tx.query(
        `SELECT count(*)::text count FROM farm_brain_runs WHERE user_id=$1 AND created_at>=date_trunc('month',now())`,
        [userId],
      );
      await this.entitlements.assertWithinLimit(
        userId,
        EntitlementMetric.GeminiAnalysesPerMonth,
        Number(monthlyRuns[0]?.count ?? 0),
        tx,
      );
      const rows: Array<{ id: string; status: string }> = await tx.query(
        `INSERT INTO farm_brain_runs(user_id,farm_id,field_id,status,schema_version,input_hash,input_manifest)
         VALUES($1,$2,$3,'QUEUED',$4,$5,$6) RETURNING id,status`,
        [userId, farmId, fieldId ?? null, FARM_BRAIN_SCHEMA_VERSION, inputHash, input],
      );
      for (const item of evidence)
        await tx.query(
          `INSERT INTO farm_brain_run_evidence(run_id,evidence_id,evidence_type,source,observed_at,snapshot_hash)
           VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(run_id,evidence_id) DO NOTHING`,
          [rows[0]!.id, item.id, item.type, item.source, item.observedAt, item.snapshotHash],
        );
      return { ...rows[0]!, created: true };
    });
    if (inserted.created)
      await this.queue.add(
        'farm-brain:investigate',
        { runId: inserted.id },
        {
          jobId: inserted.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1500 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    return { id: inserted.id, status: inserted.status, deduplicated: !inserted.created };
  }

  async get(userId: string, id: string): Promise<unknown> {
    const run = await this.run(userId, id);
    const evidence: unknown[] = await this.db.query(
      `SELECT evidence_id "evidenceId",evidence_type "evidenceType",source,observed_at "observedAt",snapshot_hash "snapshotHash" FROM farm_brain_run_evidence WHERE run_id=$1 ORDER BY created_at`,
      [id],
    );
    const toolCalls: unknown[] = await this.db.query(
      `SELECT id,name,arguments,status,reason,result_reference "resultReference",confirmed_at "confirmedAt",executed_at "executedAt" FROM farm_brain_tool_calls WHERE run_id=$1 ORDER BY created_at`,
      [id],
    );
    return {
      id: run.id,
      mode: 'GEMINI_INVESTIGATION',
      farmId: run.farmId,
      fieldId: run.fieldId,
      status: run.status,
      result: run.result,
      provider: run.provider,
      modelId: run.modelId,
      modelVersion: run.modelVersion,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      latencyMs: run.latencyMs,
      errorCode: run.errorCode,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      evidence,
      toolCalls,
    };
  }

  async process(runId: string, finalAttempt = true): Promise<void> {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<[RunRow[], number]>(
      `UPDATE farm_brain_runs SET status='RUNNING',started_at=COALESCE(started_at,now()),updated_at=now()
       WHERE id=$1 AND status IN('QUEUED','RUNNING') RETURNING id,user_id "userId",farm_id "farmId",field_id "fieldId",status,input_manifest "inputManifest",result`,
      [runId],
    );
    const run = rows[0];
    if (!run) return;
    try {
      const providerStarted = process.hrtime.bigint();
      const output = await this.provider.investigate(run.inputManifest);
      this.metrics.observe(
        'fasalguard_provider_latency_seconds',
        Number(process.hrtime.bigint() - providerStarted) / 1e9,
        { provider: 'gemini', operation: 'farm_brain_investigation' },
      );
      this.metrics.increment(
        'fasalguard_gemini_tokens_total',
        { direction: 'input' },
        output.inputTokens ?? 0,
      );
      this.metrics.increment(
        'fasalguard_gemini_tokens_total',
        { direction: 'output' },
        output.outputTokens ?? 0,
      );
      await this.db.transaction(async (tx) => {
        await tx.query(
          `UPDATE farm_brain_runs SET status='COMPLETED',result=$2,provider=$3,model_id=$4,model_version=$5,input_tokens=$6,output_tokens=$7,latency_ms=$8,completed_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
          [
            runId,
            output.result,
            output.provider,
            output.modelId,
            output.modelVersion,
            output.inputTokens,
            output.outputTokens,
            output.latencyMs,
          ],
        );
        for (const proposal of output.result.recommendedActions) {
          const status = proposalStatus(
            proposal.tool,
            output.result.riskScore,
            output.result.requiresHumanReview,
          );
          await tx.query(
            `INSERT INTO farm_brain_tool_calls(run_id,name,arguments,status,reason,result_reference,executed_at)
             VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              runId,
              proposal.tool,
              proposal.arguments,
              status,
              proposal.reason,
              isMutationTool(proposal.tool) ? null : `farm-brain-input:${runId}`,
              isMutationTool(proposal.tool) ? null : new Date(),
            ],
          );
        }
      });
      await this.notifyIfFirstCompleted(run.userId, run.farmId);
    } catch (error) {
      this.metrics.increment('fasalguard_external_api_failures_total', {
        provider: 'gemini',
        operation: 'farm_brain_investigation',
      });
      await this.db.query(
        `UPDATE farm_brain_runs SET status=$2,error_code='PROVIDER_OR_SCHEMA_FAILURE',completed_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1`,
        [runId, finalAttempt ? FarmBrainRunStatus.Failed : FarmBrainRunStatus.Queued, finalAttempt],
      );
      throw error;
    }
  }

  async confirm(userId: string, runId: string, callId: string): Promise<unknown> {
    const run = await this.run(userId, runId);
    const calls: Array<{
      id: string;
      name: FarmBrainToolName;
      arguments: Record<string, unknown>;
      status: FarmBrainToolCallStatus;
    }> = await this.db.query(
      `UPDATE farm_brain_tool_calls SET status='CONFIRMED',confirmed_by=$3,confirmed_at=now(),updated_at=now()
       WHERE id=$1 AND run_id=$2 AND status='AWAITING_CONFIRMATION'
       RETURNING id,name,arguments,status`,
      [callId, runId, userId],
    );
    const call = calls[0];
    if (!call) throw new NotFoundException('Farm Brain tool proposal was not found.');
    try {
      const reference = await this.executeConfirmed(userId, run, call);
      await this.db.query(
        `UPDATE farm_brain_tool_calls SET status='EXECUTED',result_reference=$3,executed_at=now(),updated_at=now(),version=version+1 WHERE id=$1 AND run_id=$2 AND status='CONFIRMED'`,
        [callId, runId, reference],
      );
      return { id: callId, status: FarmBrainToolCallStatus.Executed, resultReference: reference };
    } catch (error) {
      await this.db.query(
        `UPDATE farm_brain_tool_calls SET status='FAILED',updated_at=now() WHERE id=$1 AND run_id=$2 AND status='CONFIRMED'`,
        [callId, runId],
      );
      throw error;
    }
  }

  private async executeConfirmed(
    userId: string,
    run: RunRow,
    call: { id: string; name: FarmBrainToolName; arguments: Record<string, unknown> },
  ): Promise<string> {
    const requestedFieldId = stringArg(call.arguments.fieldId) ?? run.fieldId ?? undefined;
    const fieldId = await this.authorizedField(userId, run.farmId, requestedFieldId);
    if (
      [
        FarmBrainToolName.CreateInspectionTask,
        FarmBrainToolName.ScheduleFollowUp,
        FarmBrainToolName.RequestFarmerPhoto,
      ].includes(call.name)
    ) {
      const defaults: Record<string, string> = {
        [FarmBrainToolName.CreateInspectionTask]: 'Inspect the affected field area',
        [FarmBrainToolName.ScheduleFollowUp]: 'Complete a follow-up field check',
        [FarmBrainToolName.RequestFarmerPhoto]: 'Photograph affected plants for review',
      };
      const zone = safeZone(call.arguments.zone);
      const urgency = stringArg(call.arguments.urgency);
      const photoDescription =
        call.name === FarmBrainToolName.RequestFarmerPhoto
          ? `FasalGuard detected unusual crop stress${zone ? ` in the ${zone} part of your field` : ''}. Please photograph 3–5 affected plants.${urgency === 'today' ? ' Complete this today if it is safe to enter the field.' : ''}`
          : undefined;
      const created = (await this.notifications.createGeneratedTask({
        userId,
        source: TaskSource.AiActionPlan,
        title: stringArg(call.arguments.title)?.slice(0, 160) ?? defaults[call.name]!,
        description: photoDescription ?? stringArg(call.arguments.description)?.slice(0, 1000),
        fieldId,
        dueAt: parseFutureDate(call.arguments.dueAt) ?? urgencyDueAt(urgency),
        sourceReference: `farm-brain:${call.id}`,
      })) as { id?: string } | null;
      return `task:${created?.id ?? 'deduplicated'}`;
    }
    if (call.name === FarmBrainToolName.CreateIncident) {
      const result = run.result as { healthStatus?: string; riskScore?: number } | null;
      const rows: Array<{ id: string }> = await this.db.query(
        `INSERT INTO farm_incidents(farm_id,field_id,type,state,severity,confidence,title,source,source_identifier,evidence_references,detected_at)
         VALUES($1,$2,'POSSIBLE_CROP_HEALTH_STRESS',$3,$4,$5,$6,'GEMINI_FARM_BRAIN',$7,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'type',evidence_type,'source',source)),'[]'::jsonb) FROM farm_brain_run_evidence WHERE run_id=$8),now()) RETURNING id`,
        [
          run.farmId,
          fieldId ?? null,
          IncidentState.Investigating,
          severityFromHealth(result?.healthStatus),
          result?.riskScore ?? null,
          stringArg(call.arguments.title)?.slice(0, 200) ?? 'Farm health investigation',
          `farm-brain:${call.id}`,
          run.id,
        ],
      );
      return `incident:${rows[0]!.id}`;
    }
    if (call.name === FarmBrainToolName.SendFarmerAlert) {
      const notification = await this.notifications.createNotification({
        userId,
        category: NotificationCategory.System,
        title: stringArg(call.arguments.title)?.slice(0, 160) ?? 'Farm inspection recommended',
        body:
          stringArg(call.arguments.body)?.slice(0, 500) ??
          'Please review the latest farm-health evidence.',
        data: { farmId: run.farmId, ...(fieldId ? { fieldId } : {}) },
        deduplicationKey: `farm-brain:${call.id}`,
        confirmedEvidence: false,
        aiConfidence: typeof run.result?.riskScore === 'number' ? run.result.riskScore : null,
      });
      return `notification:${(notification as { id?: string } | null)?.id ?? 'deduplicated'}`;
    }
    throw new BadRequestException(
      'This tool requires a specialized domain workflow and cannot be executed here.',
    );
  }

  /** "Roadmap ready" lifecycle email — this product has no dedicated crop-roadmap feature,
   * so the first COMPLETED Farm Brain investigation is the closest real analog. Best-effort:
   * never allowed to affect the investigation's own success. */
  private async notifyIfFirstCompleted(userId: string, farmId: string): Promise<void> {
    try {
      const completedCount: Array<{ count: string }> = await this.db.query(
        `SELECT count(*)::text count FROM farm_brain_runs WHERE user_id=$1 AND status='COMPLETED'`,
        [userId],
      );
      if (Number(completedCount[0]?.count ?? 0) !== 1) return;
      const context: Array<{ email: string | null; farmName: string | null }> = await this.db.query(
        `SELECT u.email,f.name "farmName" FROM users u LEFT JOIN farms f ON f.id=$2 WHERE u.id=$1`,
        [userId, farmId],
      );
      const row = context[0];
      if (row?.email)
        await this.lifecycle.notifyRoadmapReady(userId, row.email, row.farmName ?? 'your farm');
    } catch {
      /* best-effort */
    }
  }

  private async run(userId: string, id: string): Promise<RunRow> {
    const rows: RunRow[] = await this.db.query(
      `SELECT id,user_id "userId",farm_id "farmId",field_id "fieldId",status,input_manifest "inputManifest",result,provider,model_id "modelId",model_version "modelVersion",input_tokens "inputTokens",output_tokens "outputTokens",latency_ms "latencyMs",error_code "errorCode",created_at "createdAt",completed_at "completedAt" FROM farm_brain_runs WHERE id=$1 AND user_id=$2`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('Farm Brain run was not found.');
    return rows[0];
  }

  private async authorizedField(
    userId: string,
    farmId: string,
    fieldId?: string,
  ): Promise<string | undefined> {
    if (!fieldId) return undefined;
    const rows: Array<{ id: string }> = await this.db.query(
      `SELECT fi.id FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id
       WHERE fi.id=$1 AND fa.id=$2 AND fp.user_id=$3 AND fi.deleted_at IS NULL AND fa.deleted_at IS NULL`,
      [fieldId, farmId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Selected Farm Brain field was not found.');
    return rows[0].id;
  }
}

function toFarmBrainInput(
  snapshot: Awaited<ReturnType<FarmDigitalTwinService['getSnapshot']>>,
): FarmBrainInput {
  return {
    schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
    generatedAt: snapshot.generatedAt,
    farm: { ...snapshot.farm, fields: snapshot.fields },
    crop: snapshot.crop,
    satellite: {
      latest: snapshot.latestSatellite,
      vegetationTrend: snapshot.vegetationTrend,
      anomalyEvidence: snapshot.satelliteEvidence,
    },
    weather: snapshot.weather,
    visualEvidence: snapshot.previousDiagnoses,
    history: {
      currentHealth: snapshot.currentHealth,
      interventions: snapshot.recentInterventions,
      farmerObservations: snapshot.farmerObservations,
      recoveryChecks: snapshot.recoveryChecks,
    },
    activeIncidents: snapshot.activeIncidents,
    dataFreshness: snapshot.dataFreshness,
    safetyContext: {
      satelliteIsNonDiagnostic: true,
      farmerTextIsUntrustedData: true,
      approvedGuidanceOnly: true,
    },
  };
}

function evidenceManifest(input: FarmBrainInput): Array<{
  id: string;
  type: string;
  source: string;
  observedAt: string | null;
  snapshotHash: string;
}> {
  const found = new Map<
    string,
    { id: string; type: string; source: string; observedAt: string | null; snapshotHash: string }
  >();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, path));
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const id = ['id', 'captureId', 'sourceIdentifier', 'scanId', 'riskAssessmentId']
      .map((key) => record[key])
      .find((candidate): candidate is string => typeof candidate === 'string');
    if (id && !found.has(id))
      found.set(id, {
        id,
        type: path.slice(0, 64),
        source:
          typeof record.provider === 'string'
            ? record.provider
            : typeof record.source === 'string'
              ? record.source
              : 'FASALGUARD',
        observedAt:
          typeof record.observedAt === 'string'
            ? record.observedAt
            : record.observedAt instanceof Date
              ? record.observedAt.toISOString()
              : null,
        snapshotHash: sha256(canonicalJson(record)),
      });
    Object.entries(record).forEach(([key, nested]) => visit(nested, key));
  };
  visit(input, 'farm-brain-input');
  return [...found.values()];
}

function assertPrivacyBoundary(input: FarmBrainInput): void {
  const forbidden = new Set([
    'boundary',
    'centroid',
    'phone',
    'phoneNumber',
    'email',
    'password',
    'accessToken',
    'refreshToken',
    'objectKey',
  ]);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.has(key))
        throw new BadRequestException(`Farm Brain privacy boundary rejected ${key}.`);
      visit(nested);
    }
  };
  visit(input);
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function parseFutureDate(value: unknown): Date | undefined {
  const raw = stringArg(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime()) || parsed <= new Date()) return undefined;
  return parsed;
}

function safeZone(value: unknown): string | undefined {
  const zone = stringArg(value)?.slice(0, 80);
  if (!zone || /[-+]?\d{1,3}\.\d{3,}|latitude|longitude|coordinate/i.test(zone)) return undefined;
  return zone;
}

function urgencyDueAt(urgency?: string): Date | undefined {
  const dueAt = new Date();
  if (urgency === 'today') {
    dueAt.setHours(23, 59, 59, 999);
    return dueAt > new Date() ? dueAt : new Date(Date.now() + 60 * 60 * 1000);
  }
  if (urgency === 'within_48_hours') return new Date(Date.now() + 48 * 60 * 60 * 1000);
  return undefined;
}

function proposalStatus(
  tool: FarmBrainToolName,
  riskScore: number,
  requiresHumanReview: boolean,
): FarmBrainToolCallStatus {
  if (tool === FarmBrainToolName.EscalateToExpert) return FarmBrainToolCallStatus.RejectedByPolicy;
  if (tool === FarmBrainToolName.SendFarmerAlert && !requiresHumanReview && riskScore < 0.5)
    return FarmBrainToolCallStatus.RejectedByPolicy;
  return isMutationTool(tool)
    ? FarmBrainToolCallStatus.AwaitingConfirmation
    : FarmBrainToolCallStatus.Executed;
}

function severityFromHealth(healthStatus?: string): string {
  if (healthStatus === FarmHealthStatus.Critical) return 'CRITICAL';
  if (healthStatus === FarmHealthStatus.AtRisk) return 'HIGH';
  if (healthStatus === FarmHealthStatus.Watch) return 'MODERATE';
  return 'LOW';
}
