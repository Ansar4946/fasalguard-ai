import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestObservabilityInterceptor.name);
  constructor(private readonly metrics: MetricsService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    return next.handle().pipe(
      finalize(() => {
        const latencySeconds = Number(process.hrtime.bigint() - started) / 1e9;
        const route = this.route(request);
        const labels = { method: request.method, route, status: response.statusCode };
        this.metrics.increment('fasalguard_http_requests_total', labels);
        this.metrics.observe('fasalguard_http_request_duration_seconds', latencySeconds, {
          method: request.method,
          route,
        });
        this.logger.log({
          event: 'http_request_completed',
          requestId: request.id,
          method: request.method,
          route,
          status: response.statusCode,
          latencyMs: Math.round(latencySeconds * 1000),
        });
      }),
    );
  }
  private route(request: Request): string {
    const route = (request.route as { path?: unknown } | undefined)?.path;
    return typeof route === 'string' ? `${request.baseUrl}${route}`.slice(0, 200) : 'unmatched';
  }
}
