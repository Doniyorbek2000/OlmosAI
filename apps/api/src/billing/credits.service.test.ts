import { describe, expect, it, beforeEach } from 'vitest';
import { ErrorCode } from '@veyra/types';
import { CreditsService } from './credits.service';

/**
 * Minimal in-memory Prisma stand-in exercising the reserve/capture/release
 * ledger logic (increments/decrements + idempotency keys + $transaction).
 */
function makeFakePrisma(initialBalance: number) {
  const state = { balance: initialBalance, reserved: 0 };
  const txns = new Map<string, { type: string; amount: number }>();

  const model = {
    creditBalance: {
      findUnique: async () => ({ ...state }),
      update: async ({ data }: { data: any }) => {
        if (data.reserved?.increment) state.reserved += data.reserved.increment;
        if (data.reserved?.decrement) state.reserved -= data.reserved.decrement;
        if (data.balance?.decrement) state.balance -= data.balance.decrement;
        return { ...state };
      },
    },
    creditTransaction: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        txns.get(where.idempotencyKey) ?? null,
      create: async ({ data }: { data: any }) => {
        if (data.idempotencyKey) txns.set(data.idempotencyKey, data);
        return data;
      },
    },
  };

  const prisma = {
    ...model,
    $transaction: async (fn: (tx: typeof model) => Promise<unknown>) => fn(model),
  };
  return { prisma, state };
}

describe('CreditsService ledger', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let credits: CreditsService;

  beforeEach(() => {
    fake = makeFakePrisma(100);
    credits = new CreditsService(fake.prisma as never);
  });

  it('reserves credits and reflects available balance', async () => {
    await credits.reserve('u1', 'job1', 30);
    expect(fake.state.reserved).toBe(30);
    const b = await credits.getBalance('u1');
    expect(b.available).toBe(70);
  });

  it('is idempotent: reserving the same job twice holds once', async () => {
    await credits.reserve('u1', 'job1', 30);
    await credits.reserve('u1', 'job1', 30);
    expect(fake.state.reserved).toBe(30);
  });

  it('throws INSUFFICIENT_CREDITS when available is too low', async () => {
    await expect(credits.reserve('u1', 'job1', 200)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_CREDITS,
    });
  });

  it('capture spends reserved credits from the balance', async () => {
    await credits.reserve('u1', 'job1', 40);
    await credits.capture('u1', 'job1', 40, 40);
    expect(fake.state.reserved).toBe(0);
    expect(fake.state.balance).toBe(60);
  });

  it('release refunds a reservation without charging', async () => {
    await credits.reserve('u1', 'job1', 40);
    await credits.release('u1', 'job1', 40, 'provider_failed');
    expect(fake.state.reserved).toBe(0);
    expect(fake.state.balance).toBe(100);
  });

  it('release is a no-op once the job was captured (no double refund)', async () => {
    await credits.reserve('u1', 'job1', 40);
    await credits.capture('u1', 'job1', 40, 40);
    await credits.release('u1', 'job1', 40, 'late');
    expect(fake.state.balance).toBe(60);
    expect(fake.state.reserved).toBe(0);
  });
});
