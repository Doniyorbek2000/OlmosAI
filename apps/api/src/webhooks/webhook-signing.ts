import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 webhook signatures (Stripe-style). The signed content is
 * `${timestamp}.${body}`; the header carries both so receivers can verify and
 * reject stale deliveries (spec §32).
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signWebhook(secret: string, body: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds = 300,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(now - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Exponential backoff schedule for delivery retries (ms). */
export function retryDelayMs(attempt: number): number {
  // attempt: 1..N → 5s, 25s, 125s, ... capped at 1h.
  return Math.min(60 * 60 * 1000, 5000 * Math.pow(5, attempt - 1));
}

export const WEBHOOK_MAX_ATTEMPTS = 6;

export const WEBHOOK_EVENTS = [
  'generation.started',
  'generation.progress',
  'generation.completed',
  'generation.failed',
  'asset.created',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
