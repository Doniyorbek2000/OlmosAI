import { Inject, Injectable } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { AssetWorkerClient } from './asset-worker.client';
import {
  buildConvertPlan,
  buildDecimatePlan,
  buildGameReadyPlan,
  buildOptimizePlan,
  buildRemeshPlan,
  buildRetexturePlan,
  type GameReadyOptions,
  type ProcessingPlan,
} from './game-ready';
import { ASSET_PROCESSING_QUEUE, type AssetProcessingJobData } from './asset-processing.queue';

const COST: Record<string, number> = { OPTIMIZE: 1, REMESH: 1, GAME_READY: 3 };

@Injectable()
export class AssetProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly worker: AssetWorkerClient,
    @Inject(ASSET_PROCESSING_QUEUE) private readonly queue: BullJobQueue<AssetProcessingJobData>,
  ) {}

  optimize(userId: string, assetId: string) {
    return this.enqueue(userId, assetId, 'OPTIMIZE', buildOptimizePlan());
  }

  decimate(userId: string, assetId: string, targetPolygons: number) {
    return this.enqueue(userId, assetId, 'OPTIMIZE', buildDecimatePlan(targetPolygons));
  }

  remesh(userId: string, assetId: string) {
    return this.enqueue(userId, assetId, 'REMESH', buildRemeshPlan());
  }

  retexture(userId: string, assetId: string, color: string) {
    return this.enqueue(userId, assetId, 'OPTIMIZE', buildRetexturePlan(color));
  }

  convert(userId: string, assetId: string, format: string) {
    return this.enqueue(userId, assetId, 'OPTIMIZE', buildConvertPlan(format));
  }

  gameReady(userId: string, assetId: string, opts: GameReadyOptions) {
    return this.enqueue(userId, assetId, 'GAME_READY', buildGameReadyPlan(opts));
  }

  private async enqueue(userId: string, assetId: string, kind: string, plan: ProcessingPlan) {
    if (!this.worker.enabled) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Asset processing is not available');
    }
    // Resolve the source model file from the asset's current version.
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { files: { where: { role: 'MODEL' } } },
        },
      },
    });
    if (!asset) throw new VeyraError(ErrorCode.NOT_FOUND, 'Asset not found');
    const sourceVersion = asset.versions[0];
    const sourceFile = sourceVersion?.files.find((f) => f.format === 'GLB') ?? sourceVersion?.files[0];
    if (!sourceFile) throw new VeyraError(ErrorCode.INVALID_INPUT, 'Asset has no model file to process');

    const credits = COST[kind] ?? 1;
    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        projectId: asset.projectId,
        kind: kind as never,
        status: 'QUEUED',
        input: {
          assetId,
          sourceVersionId: sourceVersion.id,
          sourceKey: sourceFile.storageKey,
          plan,
        } as unknown as object,
        reservedCredits: credits,
      },
    });

    try {
      await this.credits.reserve(userId, job.id, credits);
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorCode: ErrorCode.INSUFFICIENT_CREDITS },
      });
      throw err;
    }

    await this.queue.add(kind.toLowerCase(), { jobId: job.id, userId }, { jobId: job.id, attempts: 2, backoffMs: 2000 });
    return job;
  }
}
