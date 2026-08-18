/**
 * Provider-agnostic payment abstraction (spec §30). Subscription/credit logic
 * never couples to Stripe directly — it consumes NormalizedBillingEvents. New
 * providers (e.g. Uzbek gateways) implement this interface.
 */
export type BillingEventType =
  | 'credits.purchased'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'payment.failed'
  | 'unhandled';

export interface NormalizedBillingEvent {
  /** Provider event id — the idempotency key for the whole event. */
  id: string;
  type: BillingEventType;
  rawType: string;
  userId?: string;
  planKey?: string;
  packKey?: string;
  creditsToGrant?: number;
  amountCents?: number;
  currency?: string;
  externalPaymentId?: string;
  externalSubscriptionId?: string;
  externalCustomerId?: string;
  externalPriceId?: string;
  subscriptionStatus?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface CheckoutInput {
  userId: string;
  email: string;
  mode: 'subscription' | 'payment';
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  readonly id: string;
  readonly enabled: boolean;
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string; externalId: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  ensureCustomer(userId: string, email: string, existingId?: string): Promise<string>;
  /** Verify the signature and normalize the event. Throws on bad signature. */
  verifyAndParse(rawBody: Buffer | string, signature: string): NormalizedBillingEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
