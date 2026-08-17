import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
@ApiTags('Admin integrations')
@ApiBearerAuth()
@Controller('admin/integrations')
@Roles(UserRole.Admin, UserRole.SuperAdmin)
export class IntegrationUsageController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  @Get('usage') async usage(@Query('provider') provider?: string): Promise<unknown> {
    const params: unknown[] = [];
    const where = provider ? (params.push(provider), `WHERE provider=$1`) : '';
    const summary: Array<Record<string, unknown>> = await this.db.query(
      `SELECT provider,operation,sum(request_count)::integer "requestCount",sum(COALESCE(quota_units,0)) "processingUnits",round(avg(duration_ms))::integer "averageLatencyMs",count(*) FILTER(WHERE success=false)::integer "failureCount",max(created_at) "lastRequestAt" FROM integration_usage ${where} GROUP BY provider,operation ORDER BY provider,operation`,
      params,
    );
    const recent: Array<Record<string, unknown>> = await this.db.query(
      `SELECT provider,operation,request_count "requestCount",quota_units "processingUnits",duration_ms "latencyMs",status_code "status",success,error_code "errorCode",created_at "timestamp" FROM integration_usage ${where} ORDER BY created_at DESC LIMIT 100`,
      params,
    );
    return { summary, recent };
  }
}
