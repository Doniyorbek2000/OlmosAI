import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders Prometheus text including recorded generation metrics', async () => {
    const m = new MetricsService();
    m.recordGeneration('IMAGE_TO_3D', 'completed', 12.5);
    m.recordGeneration('TEXT_TO_3D', 'failed');
    m.recordCreditsCaptured(6);
    m.recordQueueWait(3.2);
    m.recordWebhookDelivery('delivered');

    const text = await m.render();
    expect(text).toContain('veyra_generations_total');
    expect(text).toContain('status="completed"');
    expect(text).toContain('status="failed"');
    expect(text).toContain('veyra_credits_captured_total 6');
    expect(text).toContain('veyra_generation_duration_seconds');
    expect(text).toContain('veyra_webhook_deliveries_total');
  });

  it('only records duration for completed generations', async () => {
    const m = new MetricsService();
    m.recordGeneration('IMAGE_TO_3D', 'completed', 5);
    m.recordGeneration('IMAGE_TO_3D', 'failed'); // no duration observed
    const text = await m.render();
    // Two generations recorded, but the duration histogram has one observation.
    expect(text).toContain('veyra_generation_duration_seconds_count{kind="IMAGE_TO_3D"} 1');
  });
});
