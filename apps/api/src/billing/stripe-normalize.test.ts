import { describe, expect, it } from 'vitest';
import { normalizeStripeEvent } from './payment/stripe.provider';

// Minimal Stripe.Event shapes — enough to exercise the mapper.
function evt(type: string, object: unknown, id = 'evt_1'): any {
  return { id, type, data: { object } };
}

describe('normalizeStripeEvent', () => {
  it('maps a credit-pack checkout to credits.purchased with the credit count', () => {
    const e = normalizeStripeEvent(
      evt('checkout.session.completed', {
        metadata: { userId: 'u1', kind: 'credits', packKey: 'pack_100', credits: '100' },
        customer: 'cus_1',
        amount_total: 900,
        currency: 'usd',
        payment_intent: 'pi_1',
        id: 'cs_1',
      }),
    );
    expect(e.type).toBe('credits.purchased');
    expect(e.userId).toBe('u1');
    expect(e.creditsToGrant).toBe(100);
    expect(e.externalPaymentId).toBe('pi_1');
  });

  it('maps a subscription checkout to subscription.activated', () => {
    const e = normalizeStripeEvent(
      evt('checkout.session.completed', {
        metadata: { userId: 'u1', kind: 'subscription', planKey: 'PRO' },
        customer: 'cus_1',
        subscription: 'sub_1',
        id: 'cs_2',
      }),
    );
    expect(e.type).toBe('subscription.activated');
    expect(e.planKey).toBe('PRO');
    expect(e.externalSubscriptionId).toBe('sub_1');
  });

  it('maps invoice.paid to subscription.renewed with price + period', () => {
    const e = normalizeStripeEvent(
      evt('invoice.paid', {
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 3900,
        currency: 'usd',
        payment_intent: 'pi_2',
        subscription_details: { metadata: { userId: 'u1', planKey: 'PRO' } },
        lines: { data: [{ price: { id: 'price_pro' }, period: { start: 1700000000, end: 1702592000 } }] },
      }),
    );
    expect(e.type).toBe('subscription.renewed');
    expect(e.externalPriceId).toBe('price_pro');
    expect(e.periodEnd).toBeInstanceOf(Date);
  });

  it('maps subscription lifecycle events', () => {
    const updated = normalizeStripeEvent(
      evt('customer.subscription.updated', {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro' } }] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
      }),
    );
    expect(updated.type).toBe('subscription.updated');
    expect(updated.subscriptionStatus).toBe('active');

    const deleted = normalizeStripeEvent(
      evt('customer.subscription.deleted', { id: 'sub_1', customer: 'cus_1' }),
    );
    expect(deleted.type).toBe('subscription.canceled');
  });

  it('maps unknown events to unhandled', () => {
    expect(normalizeStripeEvent(evt('charge.refunded', {})).type).toBe('unhandled');
  });
});
