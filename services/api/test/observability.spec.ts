import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../src/observability/metrics.service';
import { SentryCompatibleErrorReporter } from '../src/observability/error-reporter';

describe('production observability', () => {
  it('renders counters and latency summaries in Prometheus format', () => {
    const metrics = new MetricsService();
    metrics.increment('fasalguard_external_api_failures_total', { provider: 'weather' });
    metrics.observe('fasalguard_provider_latency_seconds', 0.25, { provider: 'weather' });
    const output = metrics.render();
    expect(output).toContain('fasalguard_external_api_failures_total{provider="weather"} 1');
    expect(output).toContain('fasalguard_provider_latency_seconds_count{provider="weather"} 1');
    expect(output).toContain(
      'fasalguard_provider_latency_seconds_sum{provider="weather"} 0.250000',
    );
  });

  it('sends only generic errors and sanitized technical tags to Sentry-compatible ingestion', async () => {
    let capturedBody = '';
    const fetchMock = jest.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      const reporter = new SentryCompatibleErrorReporter(
        new ConfigService({
          sentryDsn: 'https://public-key@errors.example/42',
          sentryEnvironment: 'test',
        }),
      );
      await reporter.capture(
        new Error('password=hunter2 Bearer secret-token at 30.123456,71.123456 farmer@example.com'),
        { requestId: 'req-1', method: 'POST', route: '/api/v1/crop-scans', status: 500 },
      );
      expect(capturedBody).toContain('Application error');
      expect(capturedBody).not.toContain('hunter2');
      expect(capturedBody).not.toContain('secret-token');
      expect(capturedBody).not.toContain('30.123456');
      expect(capturedBody).not.toContain('farmer@example.com');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
