import { Injectable } from '@nestjs/common';
import { VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Credit ledger. Reservation → capture/release is atomic and idempotent so a
 * job never double-charges or double-refunds (spec §28, §70, §71, §72).
 *
 * Available balance = balance - reserved. Reserve moves credits into `reserved`;
 * capture removes them from both balance and reserved (final spend); release
 * returns them to available (refund on server/provider failure).
 */
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string): Promise<{ balance: number; reserved: number; available: number }> {
    const b = await this.prisma.creditBalance.findUnique({ where: { userId } });
    const balance = b?.balance ?? 0;
    const reserved = b?.reserved ?? 0;
    return { balance, reserved, available: balance - reserved };
  }

  /** Reserve credits for a job. Idempotent per (jobId, RESERVE). */
  /**
   * Grant credits (plan renewal, purchase, admin adjustment). Idempotent per
   * `idempotencyKey` so a replayed payment webhook never double-grants. Creates
   * the balance row if missing.
   */
  async grant(
    userId: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<{ granted: boolean }> {
    if (amount <= 0) return { granted: false };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey } });
      if (existing) return { granted: false }; // replay — already granted
      await tx.creditBalance.upsert({
        where: { userId },
        update: { balance: { increment: amount } },
        create: { userId, balance: amount },
      });
      await tx.creditTransaction.create({
        data: { userId, type: 'GRANT', amount, reason, idempotencyKey },
      });
      return { granted: true };
    });
  }

  async reserve(userId: string, jobId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const key = `reserve:${jobId}`;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existing) return; // already reserved

      const balance = await tx.creditBalance.findUnique({ where: { userId } });
      const available = (balance?.balance ?? 0) - (balance?.reserved ?? 0);
      if (available < amount) {
        throw VeyraError.insufficientCredits(amount, available);
      }
      await tx.creditBalance.update({
        where: { userId },
        data: { reserved: { increment: amount } },
      });
      await tx.creditTransaction.create({
        data: { userId, type: 'RESERVE', amount: -amount, jobId, idempotencyKey: key },
      });
    });
  }

  /** Finalize a reservation as a real spend. Idempotent per (jobId, CAPTURE). */
  async capture(userId: string, jobId: string, reservedAmount: number, actualAmount: number): Promise<void> {
    const key = `capture:${jobId}`;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existing) return;
      const charge = Math.max(0, Math.min(actualAmount, reservedAmount));
      await tx.creditBalance.update({
        where: { userId },
        data: {
          reserved: { decrement: reservedAmount },
          balance: { decrement: charge },
        },
      });
      await tx.creditTransaction.create({
        data: { userId, type: 'CAPTURE', amount: -charge, jobId, idempotencyKey: key },
      });
      // If actual < reserved, the difference is implicitly released (reserved
      // decremented by the full reservation, balance only by the charge).
    });
  }

  /** Release a reservation without charging (refund on failure). Idempotent. */
  async release(userId: string, jobId: string, amount: number, reason: string): Promise<void> {
    const key = `release:${jobId}`;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: key } });
      const captured = await tx.creditTransaction.findUnique({
        where: { idempotencyKey: `capture:${jobId}` },
      });
      if (existing || captured) return; // already released or already captured
      await tx.creditBalance.update({
        where: { userId },
        data: { reserved: { decrement: amount } },
      });
      await tx.creditTransaction.create({
        data: { userId, type: 'RELEASE', amount, jobId, idempotencyKey: key, reason },
      });
    });
  }
}
