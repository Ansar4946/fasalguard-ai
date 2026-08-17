import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, type DependencyStatus } from './health.service';
import { Public } from '../domain/auth/decorators/public.decorator';
@ApiTags('Platform health')
@Controller({ path: '', version: '1' })
@Public()
export class HealthController {
  constructor(private readonly service: HealthService) {}
  @Get('health')
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiResponse({ status: 200 })
  health(): { status: 'ok'; service: string; timestamp: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      service: 'fasalguard-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Database, PostGIS, and Redis readiness probe' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503 })
  async ready(): Promise<{ status: 'ready'; dependencies: DependencyStatus }> {
    const dependencies = await this.service.readiness();
    const required = [
      dependencies.database,
      dependencies.postgis,
      dependencies.redis,
      dependencies.objectStorage,
    ];
    if (required.some((x) => x !== 'up'))
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        message: 'One or more required dependencies are unavailable.',
        details: dependencies,
      });
    return { status: 'ready', dependencies };
  }
}
