import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics for the API + generation pipeline (spec §43). Exposed at
 * /api/metrics and scraped by Prometheus; Grafana dashboards live in infra.
 * OpenTelemetry-compatible naming.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly generations = new Counter({
    name: 'veyra_generations_total',
    help: 'Generation jobs by outcome',
    labelNames: ['kind', 'status'] as const,
    registers: [this.registry],
  });

  private readonly generationDuration = new Histogram({
    name: 'veyra_generation_duration_seconds',
    help: 'End-to-end generation duration',
    labelNames: ['kind'] as const,
    buckets: [1, 2, 5, 10, 30, 60, 120, 300],
    registers: [this.registry],
  });

  private readonly queueWait = new Histogram({
    name: 'veyra_queue_wait_seconds',
    help: 'Time a job waited in the queue before running',
    buckets: [0.5, 1, 2, 5, 15, 30, 60, 120],
    registers: [this.registry],
  });

  private readonly creditsCaptured = new Counter({
    name: 'veyra_credits_captured_total',
    help: 'Credits captured (spent) across all users',
    registers: [this.registry],
  });

  private readonly webhookDeliveries = new Counter({
    name: 'veyra_webhook_deliveries_total',
    help: 'Webhook deliveries by outcome',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'veyra_api_' });
  }

  recordGeneration(kind: string, status: 'completed' | 'failed' | 'cancelled', durationSeconds?: number): void {
    this.generations.labels(kind, status).inc();
    if (status === 'completed' && durationSeconds !== undefined) {
      this.generationDuration.labels(kind).observe(durationSeconds);
    }
  }

  recordQueueWait(seconds: number): void {
    if (seconds >= 0) this.queueWait.observe(seconds);
  }

  recordCreditsCaptured(amount: number): void {
    if (amount > 0) this.creditsCaptured.inc(amount);
  }

  recordWebhookDelivery(status: 'delivered' | 'failed'): void {
    this.webhookDeliveries.labels(status).inc();
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
