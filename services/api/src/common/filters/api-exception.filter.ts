import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_REPORTER, type ErrorReporter } from '../../observability/error-reporter';
import { MetricsService } from '../../observability/metrics.service';
interface Payload {
  code: string;
  message: string;
  details?: unknown;
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  constructor(
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
    private readonly metrics: MetricsService,
  ) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const payload = this.payload(exception, status);
    if (status >= 500) {
      this.metrics.increment('fasalguard_unhandled_errors_total', { status });
      this.logger.error({
        requestId: this.requestId(req),
        route: this.route(req),
        status,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      void this.reporter.capture(exception, {
        requestId: this.requestId(req),
        method: req.method,
        route: this.route(req),
        status,
        component: 'http',
      });
    }
    res.status(status).json({
      error: payload,
      meta: { requestId: req.id, timestamp: new Date().toISOString(), path: req.originalUrl },
    });
  }
  private route(req: Request): string {
    const route = (req.route as { path?: unknown } | undefined)?.path;
    return typeof route === 'string' ? `${req.baseUrl}${route}`.slice(0, 200) : 'unmatched';
  }
  private requestId(req: Request): string {
    return typeof req.id === 'string' || typeof req.id === 'number' ? `${req.id}` : 'unknown';
  }
  private payload(exception: unknown, status: number): Payload {
    if (!(exception instanceof HttpException))
      return { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' };
    const body: unknown = exception.getResponse();
    if (typeof body === 'string') return { code: this.code(status), message: body };
    if (typeof body === 'object' && body) {
      const value = body as Record<string, unknown>;
      const message = value.message;
      return {
        code: typeof value.code === 'string' ? value.code : this.code(status),
        message: Array.isArray(message)
          ? 'Request validation failed.'
          : typeof message === 'string'
            ? message
            : exception.message,
        ...(Array.isArray(message)
          ? { details: message }
          : value.details
            ? { details: value.details }
            : {}),
      };
    }
    return { code: this.code(status), message: exception.message };
  }
  private code(status: number): string {
    return HttpStatus[status]?.toString() ?? 'HTTP_ERROR';
  }
}
