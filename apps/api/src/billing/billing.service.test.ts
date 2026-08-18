import { describe, expect, it, beforeEach } from 'vitest';
import { CreditsService } from './credits.service';
import { BillingService } from './billing.service';
import type { NormalizedBillingEvent } from './payment/payment-provider';

/**
 * In-memory Prisma fake covering the subset billing + credit-grant use. `tx`
 * inside $transaction is the same object, so idempotency keys behave as in a
 * real transaction.
 */
function makeFake() {
  const state = {
    users: new Map<string, any>([['u1', { id: 'u1', email: 'a@b.co', stripeCustomerId: 'cus_1' }]]),
    plansByKey: new Map<string, any>([
      ['PRO', { id: 'plan_pro', key: 'PRO', name: 'Pro', monthlyCredits: 1200, priceCentsMonthly: 3900, stripePriceId: 'price_pro' }],
    ]),
    balances: new Map<string, { balance: number; reserved: number }>(),
    txns: new Map<string, any>(),
    subs: new Map<string, any>(),
    payments: [] as any[],
    paymentEventIds: new Set<string>(),
    processed: new Set<string>(),
  };

  const applyDelta = (target: any, data: any, field: string) => {
    if (data[field]?.increment !== undefined) target[field] += data[field].increment;
    else if (data[field]?.decrement !== undefined) target[field] -= data[field].decrement;
    else if (typeof data[field] === 'number') target[field] = data[field];
  };

  const model = {
    processedWebhookEvent: {
      create: async ({ data }: any) => {
        const key = `${data.provider}:${data.eventId}`;
        if (state.processed.has(key)) throw new Error('unique');
        state.processed.add(key);
        return data;
      },
    },
    creditTransaction: {
      findUnique: async ({ where }: any) => state.txns.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        if (data.idempotencyKey) {
          if (state.txns.has(data.idempotencyKey)) throw new Error('unique');
          state.txns.set(data.idempotencyKey, data);
        }
        return data;
      },
    },
    creditBalance: {
      findUnique: async ({ where }: any) => state.balances.get(where.userId) ?? null,
      upsert: async ({ where, update, create }: any) => {
        const existing = state.balances.get(where.userId);
        if (existing) {
          applyDelta(existing, update, 'balance');
          applyDelta(existing, update, 'reserved');
          return existing;
        }
        const row = { balance: 0, reserved: 0, ...create };
        state.balances.set(where.userId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.balances.get(where.userId) ?? { balance: 0, reserved: 0 };
        applyDelta(row, data, 'balance');
        applyDelta(row, data, 'reserved');
        state.balances.set(where.userId, row);
        return row;
      },
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) return state.users.get(where.id) ?? null;
        if (where.stripeCustomerId)
          return [...state.users.values()].find((u) => u.stripeCustomerId === where.stripeCustomerId) ?? null;
        return null;
      },
      update: async ({ where, data }: any) => {
        const u = state.users.get(where.id);
        if (u) Object.assign(u, data);
        return u;
      },
    },
    plan: {
      findUnique: async ({ where }: any) => {
        if (where.key) return state.plansByKey.get(where.key) ?? null;
        if (where.stripePriceId)
          return [...state.plansByKey.values()].find((p) => p.stripePriceId === where.stripePriceId) ?? null;
        return null;
      },
    },
    subscription: {
      upsert: async ({ where, update, create }: any) => {
        const existing = state.subs.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { userId: where.userId, ...create };
        state.subs.set(where.userId, row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = [...state.subs.values()].filter((s) =>
          where.userId ? s.userId === where.userId : true,
        );
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      findFirst: async ({ where }: any) =>
        [...state.subs.values()].find((s) =>
          where.externalId ? s.externalId === where.externalId : true,
        ) ?? null,
    },
    payment: {
      create: async ({ data }: any) => {
        if (data.eventId && state.paymentEventIds.has(data.eventId)) throw new Error('unique');
        if (data.eventId) state.paymentEventIds.add(data.eventId);
        state.payments.push(data);
        return data;
      },
    },
  };

  const prisma: any = { ...model, $transaction: async (fn: any) => fn(model) };
  return { prisma, state };
}

const config: any = { env: { WEB_URL: 'http://localhost:3000' } };
const payments: any = { id: 'stripe', enabled: true };

function creditsEvent(id: string): NormalizedBillingEvent {
  return {
    id,
    type: 'credits.purchased',
    rawType: 'checkout.session.completed',
    userId: 'u1',
    packKey: 'pack_100',
    creditsToGrant: 100,
    amountCents: 900,
    currency: 'usd',
    externalPaymentId: `pi_${id}`,
  };
}

describe('BillingService.applyEvent', () => {
  let fake: ReturnType<typeof makeFake>;
  let billing: BillingService;

  beforeEach(() => {
    fake = makeFake();
    const credits = new CreditsService(fake.prisma as never);
    billing = new BillingService(fake.prisma as never, credits, config, payments);
  });

  it('grants credits on a credit purchase and records the payment', async () => {
    const res = await billing.applyEvent(creditsEvent('evt_1'));
    expect(res.processed).toBe(true);
    expect(fake.state.balances.get('u1')?.balance).toBe(100);
    expect(fake.state.payments).toHaveLength(1);
  });

  it('is idempotent: a replayed event does not double-grant', async () => {
    await billing.applyEvent(creditsEvent('evt_1'));
    const replay = await billing.applyEvent(creditsEvent('evt_1'));
    expect(replay.processed).toBe(false);
    expect(fake.state.balances.get('u1')?.balance).toBe(100);
    expect(fake.state.payments).toHaveLength(1);
  });

  it('grants the plan monthly credits on subscription renewal', async () => {
    const res = await billing.applyEvent({
      id: 'evt_renew_1',
      type: 'subscription.renewed',
      rawType: 'invoice.paid',
      userId: 'u1',
      planKey: 'PRO',
      externalSubscriptionId: 'sub_1',
      externalPriceId: 'price_pro',
      amountCents: 3900,
      periodEnd: new Date(),
    });
    expect(res.processed).toBe(true);
    expect(fake.state.balances.get('u1')?.balance).toBe(1200);
  });

  it('resolves the plan by Stripe price id when no planKey is present', async () => {
    await billing.applyEvent({
      id: 'evt_renew_2',
      type: 'subscription.renewed',
      rawType: 'invoice.paid',
      externalCustomerId: 'cus_1',
      externalPriceId: 'price_pro',
    });
    expect(fake.state.balances.get('u1')?.balance).toBe(1200);
  });

  it('activates a subscription and links the plan', async () => {
    await billing.applyEvent({
      id: 'evt_act_1',
      type: 'subscription.activated',
      rawType: 'checkout.session.completed',
      userId: 'u1',
      planKey: 'PRO',
      externalSubscriptionId: 'sub_1',
      externalCustomerId: 'cus_1',
    });
    expect(fake.state.subs.get('u1')?.status).toBe('ACTIVE');
    expect(fake.state.subs.get('u1')?.planId).toBe('plan_pro');
  });

  it('cancels a subscription', async () => {
    fake.state.subs.set('u1', { userId: 'u1', status: 'ACTIVE' });
    await billing.applyEvent({
      id: 'evt_cancel_1',
      type: 'subscription.canceled',
      rawType: 'customer.subscription.deleted',
      userId: 'u1',
    });
    expect(fake.state.subs.get('u1')?.status).toBe('CANCELED');
  });

  it('ignores unhandled events', async () => {
    const res = await billing.applyEvent({ id: 'evt_x', type: 'unhandled', rawType: 'charge.refunded' });
    expect(res.processed).toBe(false);
  });
});
