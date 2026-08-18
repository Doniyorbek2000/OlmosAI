import { Injectable } from '@nestjs/common';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { BillingAdminService } from '../billing/billing-admin.service';
import { ProviderRegistryService } from '../orchestrator/provider-registry.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingAdmin: BillingAdminService,
    private readonly orchestrator: ProviderRegistryService,
  ) {}

  async overview() {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [
      totalUsers,
      activeUsers,
      billing,
      totalJobs,
      failedJobs,
      queueDepth,
      jobsByStatus,
      storage,
      apiUsage,
      providers,
      workers,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, sessions: { some: { createdAt: { gte: since } } } } }),
      this.billingAdmin.overview(),
      this.prisma.generationJob.count(),
      this.prisma.generationJob.count({ where: { status: 'FAILED' } }),
      this.prisma.generationJob.count({
        where: { status: { in: ['QUEUED', 'WAITING_FOR_GPU', 'RUNNING'] } },
      }),
      this.prisma.generationJob.groupBy({ by: ['status'], _count: true }),
      this.prisma.assetFile.aggregate({ _sum: { sizeBytes: true } }),
      this.prisma.apiUsage.count(),
      this.prisma.aIProvider.findMany({ orderBy: { priority: 'desc' } }),
      this.prisma.gPUWorker.findMany({ orderBy: { updatedAt: 'desc' } }),
    ]);

    return {
      users: { total: totalUsers, activeLast30d: activeUsers },
      revenue: {
        totalCents: billing.revenueCents,
        mrrCents: billing.mrrCents,
        creditsGranted: billing.creditsGranted,
        creditsConsumed: billing.creditsConsumed,
        activeSubscriptions: billing.activeSubscriptions,
        planBreakdown: billing.planBreakdown,
      },
      jobs: {
        total: totalJobs,
        failed: failedJobs,
        queueDepth,
        byStatus: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count])),
      },
      storageBytes: storage._sum.sizeBytes ?? 0,
      apiCalls: apiUsage,
      providers,
      workers,
    };
  }

  listUsers(query?: string, take = 50) {
    return this.prisma.user.findMany({
      where: query
        ? {
            deletedAt: null,
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        subscription: { select: { plan: { select: { key: true } }, status: true } },
        creditBalance: { select: { balance: true, reserved: true } },
      },
    });
  }

  listJobs(status?: string, take = 50) {
    return this.prisma.generationJob.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
      select: {
        id: true,
        userId: true,
        kind: true,
        status: true,
        providerId: true,
        chargedCredits: true,
        errorCode: true,
        createdAt: true,
        completedAt: true,
      },
    });
  }

  listProviders() {
    return this.prisma.aIProvider.findMany({ orderBy: { priority: 'desc' }, include: { models: true } });
  }

  /** Enable/disable/drain/priority/cost — then rebuild the live registry. */
  async updateProvider(
    providerId: string,
    patch: { enabled?: boolean; priority?: number; costMultiplier?: number; draining?: boolean },
  ) {
    const provider = await this.prisma.aIProvider.findUnique({ where: { providerId } });
    if (!provider) throw new VeyraError(ErrorCode.NOT_FOUND, 'Provider not found');
    const updated = await this.prisma.aIProvider.update({
      where: { providerId },
      data: patch,
    });
    await this.orchestrator.reload();
    return updated;
  }

  listWorkers() {
    return this.prisma.gPUWorker.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async updateWorker(id: string, patch: { status?: string; maxConcurrency?: number }) {
    const worker = await this.prisma.gPUWorker.findUnique({ where: { id } });
    if (!worker) throw new VeyraError(ErrorCode.NOT_FOUND, 'Worker not found');
    return this.prisma.gPUWorker.update({
      where: { id },
      data: { status: patch.status as never, maxConcurrency: patch.maxConcurrency },
    });
  }
}
