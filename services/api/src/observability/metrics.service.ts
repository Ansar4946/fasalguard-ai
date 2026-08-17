import { Injectable } from '@nestjs/common';

type Labels = Record<string, string | number | boolean>;
interface MetricValue {
  value: number;
  labels: Labels;
}
const safeName = (value: string): string => value.replace(/[^a-zA-Z0-9_:]/g, '_');
const safeLabel = (value: string | number | boolean): string =>
  String(value)
    .replace(/[\\"\n\r]/g, '_')
    .slice(0, 100);

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, MetricValue>();
  private readonly summaries = new Map<string, { count: number; sum: number; labels: Labels }>();

  increment(name: string, labels: Labels = {}, amount = 1): void {
    const key = this.key(name, labels);
    const current = this.counters.get(key);
    this.counters.set(key, { value: (current?.value ?? 0) + amount, labels });
  }
  observe(name: string, seconds: number, labels: Labels = {}): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const key = this.key(name, labels);
    const current = this.summaries.get(key) ?? { count: 0, sum: 0, labels };
    current.count += 1;
    current.sum += seconds;
    this.summaries.set(key, current);
  }
  render(): string {
    const lines = [
      '# HELP fasalguard_process_uptime_seconds Process uptime.',
      '# TYPE fasalguard_process_uptime_seconds gauge',
      `fasalguard_process_uptime_seconds ${process.uptime().toFixed(3)}`,
    ];
    for (const [key, metric] of this.counters) {
      const name = safeName(key.split('|')[0]!);
      lines.push(`# TYPE ${name} counter`, `${name}${this.labels(metric.labels)} ${metric.value}`);
    }
    for (const [key, metric] of this.summaries) {
      const name = safeName(key.split('|')[0]!);
      lines.push(
        `# TYPE ${name} summary`,
        `${name}_count${this.labels(metric.labels)} ${metric.count}`,
        `${name}_sum${this.labels(metric.labels)} ${metric.sum.toFixed(6)}`,
      );
    }
    return `${[...new Set(lines)].join('\n')}\n`;
  }
  private key(name: string, labels: Labels): string {
    return `${safeName(name)}|${Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${safeName(k)}=${safeLabel(v)}`)
      .join(',')}`;
  }
  private labels(labels: Labels): string {
    const entries = Object.entries(labels);
    return entries.length
      ? `{${entries.map(([k, v]) => `${safeName(k)}="${safeLabel(v)}"`).join(',')}}`
      : '';
  }
}
