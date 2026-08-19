import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { AiOperationsAnalyticsService } from './ai-operations-analytics.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

const CSV_COLUMNS = [
  'id',
  'createdAt',
  'operation',
  'provider',
  'model',
  'status',
  'latencyMs',
  'confidence',
  'toolCallCount',
  'humanReviewStatus',
  'errorCode',
] as const;

@ApiTags('Admin AI operations')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'admin/ai-operations', version: '1' })
export class AdminAiOperationsController {
  constructor(private readonly analytics: AiOperationsAnalyticsService) {}

  @ApiOperation({
    summary: 'Real Gemini/AI execution telemetry — calls, success rate, latency, tool calls',
  })
  @Get()
  summary() {
    return this.analytics.summary();
  }

  @ApiOperation({
    summary: 'Exportable, judge-facing CSV of every real AI run — no aggregation, no fabrication',
  })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ai-runs-evidence.csv"')
  @Get('export.csv')
  async exportCsv(): Promise<string> {
    const rows = await this.analytics.exportRows();
    const header = CSV_COLUMNS.join(',');
    const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
    return [header, ...lines].join('\n');
  }
}

function csvCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
