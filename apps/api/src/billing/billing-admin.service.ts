import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Aggregated billing data for the admin panel (spec §53). */
@Injectable()
export class BillingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [revenue, creditsGranted, creditsSpent, activeSubs, planBreakdown, recentPayments] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: { status: 'SUCCEEDED' },
          _sum: { amountCents: true },
          _count: true,
        }),
        this.prisma.creditTransaction.aggregate({
          where: { type: 'GRANT' },
          _sum: { amount: true },
        }),
        this.prisma.creditTransaction.aggregate({
          where: { type: 'CAPTURE' },
          _sum: { amount: true },
        }),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.groupBy({
          by: ['planId'],
          where: { status: 'ACTIVE' },
          _count: true,
        }),
        this.prisma.payment.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            userId: true,
            amountCents: true,
            currency: true,
            status: true,
            provider: true,
            createdAt: true,
          },
        }),
      ]);

    const plans = await this.prisma.plan.findMany({ select: { id: true, key: true, name: true } });
    const planMap = new Map(plans.map((p) => [p.id, p]));

    // MRR estimate: sum active subscriptions' monthly price.
    const activeWithPlan = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: { select: { priceCentsMonthly: true } } },
    });
    const mrrCents = activeWithPlan.reduce((sum, s) => sum + (s.plan?.priceCentsMonthly ?? 0), 0);

    return {
      revenueCents: revenue._sum.amountCents ?? 0,
      paymentCount: revenue._count,
      creditsGranted: creditsGranted._sum.amount ?? 0,
      // CAPTURE amounts are stored negative; report the absolute consumed total.
      creditsConsumed: Math.abs(creditsSpent._sum.amount ?? 0),
      activeSubscriptions: activeSubs,
      mrrCents,
      planBreakdown: planBreakdown.map((b) => ({
        plan: planMap.get(b.planId)?.key ?? b.planId,
        count: b._count,
      })),
      recentPayments,
    };
  }
}
