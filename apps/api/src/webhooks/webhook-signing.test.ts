import { describe, expect, it } from 'vitest';
import {
  generateWebhookSecret,
  retryDelayMs,
  signWebhook,
  verifyWebhookSignature,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhook-signing';

describe('webhook signing', () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ event: 'generation.completed', data: { jobId: 'j1' } });

  it('produces a secret with the whsec_ prefix', () => {
    expect(secret.startsWith('whsec_')).toBe(true);
  });

  it('verifies a valid signature within tolerance', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhook(secret, body, ts);
    expect(verifyWebhookSignature(secret, body, header, 300, ts)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhook(secret, body, ts);
    expect(verifyWebhookSignature(secret, body + 'x', header, 300, ts)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signWebhook(secret, body, ts);
    expect(verifyWebhookSignature(generateWebhookSecret(), body, header, 300, ts)).toBe(false);
  });

  it('rejects a stale timestamp beyond tolerance', () => {
    const ts = 1000;
    const header = signWebhook(secret, body, ts);
    expect(verifyWebhookSignature(secret, body, header, 300, ts + 10_000)).toBe(false);
  });
});

describe('retry backoff', () => {
  it('grows exponentially and caps at 1h', () => {
    expect(retryDelayMs(1)).toBe(5000);
    expect(retryDelayMs(2)).toBe(25000);
    expect(retryDelayMs(3)).toBe(125000);
    expect(retryDelayMs(WEBHOOK_MAX_ATTEMPTS)).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
