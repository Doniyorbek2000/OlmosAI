import Stripe from 'stripe';
import { ErrorCode, VeyraError } from '@veyra/types';
import type {
  CheckoutInput,
  NormalizedBillingEvent,
  PaymentProvider,
} from './payment-provider';

/**
 * Stripe implementation of PaymentProvider. Normalizes Stripe events into the
 * provider-agnostic shape the billing service consumes. Constructed lazily —
 * disabled when STRIPE_SECRET_KEY is not configured (dev).
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  private readonly stripe: Stripe;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion });
  }

  get enabled(): boolean {
    return Boolean(this.secretKey && this.webhookSecret);
  }

  async ensureCustomer(userId: string, email: string, existingId?: string): Promise<string> {
    if (existingId) return existingId;
    const customer = await this.stripe.customers.create({ email, metadata: { userId } });
    return customer.id;
  }

  async createCheckoutSession(
    input: CheckoutInput,
  ): Promise<{ url: string; externalId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: input.mode,
      customer: input.customerId,
      customer_email: input.customerId ? undefined : input.email,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Metadata is echoed back on the webhook so grants are deterministic.
      metadata: input.metadata,
      ...(input.mode === 'subscription'
        ? { subscription_data: { metadata: input.metadata } }
        : { payment_intent_data: { metadata: input.metadata } }),
    });
    if (!session.url) {
      throw new VeyraError(ErrorCode.INTERNAL, 'Stripe did not return a checkout URL');
    }
    return { url: session.url, externalId: session.id };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  verifyAndParse(rawBody: Buffer | string, signature: string): NormalizedBillingEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid Stripe webhook signature', {
        retryable: false,
        cause: err,
      });
    }
    return normalizeStripeEvent(event);
  }
}

/** Pure mapper — exported so it can be unit-tested without the Stripe SDK. */
export function normalizeStripeEvent(event: Stripe.Event): NormalizedBillingEvent {
  const base: NormalizedBillingEvent = { id: event.id, type: 'unhandled', rawType: event.type };

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const meta = (s.metadata ?? {}) as Record<string, string>;
      const common = {
        ...base,
        userId: meta.userId,
        externalCustomerId: typeof s.customer === 'string' ? s.customer : undefined,
        amountCents: s.amount_total ?? undefined,
        currency: s.currency ?? undefined,
        externalPaymentId: typeof s.payment_intent === 'string' ? s.payment_intent : s.id,
      };
      if (meta.kind === 'credits') {
        return {
          ...common,
          type: 'credits.purchased',
          packKey: meta.packKey,
          creditsToGrant: meta.credits ? Number(meta.credits) : undefined,
        };
      }
      // Subscription checkout: link customer/subscription; credits arrive via invoice.
      return {
        ...common,
        type: 'subscription.activated',
        planKey: meta.planKey,
        externalSubscriptionId: typeof s.subscription === 'string' ? s.subscription : undefined,
      };
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice;
      const line = inv.lines?.data?.[0];
      const price = line?.price ?? undefined;
      const meta = (inv.subscription_details?.metadata ?? inv.metadata ?? {}) as Record<string, string>;
      return {
        ...base,
        type: 'subscription.renewed',
        userId: meta.userId,
        externalCustomerId: typeof inv.customer === 'string' ? inv.customer : undefined,
        externalSubscriptionId: typeof inv.subscription === 'string' ? inv.subscription : undefined,
        externalPriceId: typeof price === 'object' ? price?.id : (price as string | undefined),
        amountCents: inv.amount_paid ?? undefined,
        currency: inv.currency ?? undefined,
        externalPaymentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.id,
        periodStart: line?.period?.start ? new Date(line.period.start * 1000) : undefined,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000) : undefined,
      };
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        ...base,
        type: 'subscription.updated',
        externalSubscriptionId: sub.id,
        externalCustomerId: typeof sub.customer === 'string' ? sub.customer : undefined,
        externalPriceId: sub.items.data[0]?.price?.id,
        subscriptionStatus: sub.status,
        periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : undefined,
        periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
      };
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        ...base,
        type: 'subscription.canceled',
        externalSubscriptionId: sub.id,
        externalCustomerId: typeof sub.customer === 'string' ? sub.customer : undefined,
      };
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      return {
        ...base,
        type: 'payment.failed',
        externalCustomerId: typeof inv.customer === 'string' ? inv.customer : undefined,
        externalSubscriptionId: typeof inv.subscription === 'string' ? inv.subscription : undefined,
      };
    }
    default:
      return base;
  }
}
