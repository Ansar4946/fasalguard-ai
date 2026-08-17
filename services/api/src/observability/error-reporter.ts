import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export interface SafeErrorContext {
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  component?: string;
  operation?: string;
}
export interface ErrorReporter {
  capture(error: unknown, context: SafeErrorContext): Promise<void>;
}
export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

@Injectable()
export class SentryCompatibleErrorReporter implements ErrorReporter {
  constructor(private readonly config: ConfigService) {}
  async capture(error: unknown, context: SafeErrorContext): Promise<void> {
    const dsn = this.config.get<string>('sentryDsn', '');
    if (!dsn) return;
    try {
      const parsed = new URL(dsn);
      const projectId = parsed.pathname.split('/').filter(Boolean).at(-1);
      if (!projectId || !parsed.username || parsed.protocol !== 'https:') return;
      const endpoint = `${parsed.origin}/api/${encodeURIComponent(projectId)}/envelope/`;
      const eventId = randomUUID().replace(/-/g, '');
      const exception = error instanceof Error ? error : new Error('Non-error exception');
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'node',
        environment: this.config.get<string>('sentryEnvironment', 'development'),
        exception: {
          values: [
            {
              type: exception.name,
              // Exception messages often contain provider payloads or request data. Keep
              // the remote event deliberately generic and retain details only in the
              // locally redacted application logs.
              value: 'Application error',
              stacktrace: this.safeStack(exception.stack),
            },
          ],
        },
        tags: this.safeContext(context),
      };
      const envelope = `${JSON.stringify({ event_id: eventId, dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-sentry-envelope' },
        body: envelope,
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
    } catch {
      // Error reporting must never break the request path or expose its own configuration errors.
    }
  }
  private safeStack(stack?: string): string | undefined {
    if (!stack) return undefined;
    return stack
      .split('\n')
      .slice(1)
      .join('\n')
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
      .replace(/([?&](?:token|key|secret|password|signature)=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/[-+]?\d{1,3}\.\d{4,}\s*[,/]\s*[-+]?\d{1,3}\.\d{4,}/g, '[REDACTED_COORDINATES]')
      .slice(0, 8000);
  }
  private safeContext(context: SafeErrorContext): Record<string, string> {
    return Object.fromEntries(
      Object.entries(context)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v).slice(0, 200)]),
    );
  }
}
