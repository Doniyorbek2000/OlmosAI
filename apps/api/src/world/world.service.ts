import { Inject, Injectable } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { StorageService } from '@veyra/storage';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { STORAGE } from '../storage/storage.module';
import { WorldWorkerClient } from './world-worker.client';
import { WORLD_QUEUE, type WorldJobData } from './world.queue';

const WORLD_COST = 5;

export interface CreateWorldDto {
  prompt: string;
  name?: string;
  projectId?: string;
  seed?: number;
  idempotencyKey?: string;
}

@Injectable()
export class WorldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly flags: FeatureFlagsService,
    private readonly worker: WorldWorkerClient,
    @Inject(STORAGE) private readonly storage: StorageService,
    @Inject(WORLD_QUEUE) private readonly queue: BullJobQueue<WorldJobData>,
  ) {}

  async create(userId: string, dto: CreateWorldDto) {
    if (!this.flags.get('WORLD_GENERATION')) {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'World generation is not enabled');
    }
    if (!this.worker.enabled) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'World worker is not available');
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.generationJob.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, userId, deletedAt: null },
      });
      if (!project) throw new VeyraError(ErrorCode.NOT_FOUND, 'Project not found');
    }

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        projectId: dto.projectId,
        kind: 'WORLD',
        status: 'QUEUED',
        idempotencyKey: dto.idempotencyKey,
        input: { prompt: dto.prompt, name: dto.name, seed: dto.seed } as unknown as object,
        reservedCredits: WORLD_COST,
      },
    });

    try {
      await this.credits.reserve(userId, job.id, WORLD_COST);
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorCode: ErrorCode.INSUFFICIENT_CREDITS },
      });
      throw err;
    }

    await this.queue.add('world', { jobId: job.id, userId }, { jobId: job.id, attempts: 2, backoffMs: 2000 });
    return job;
  }

  listWorlds(userId: string) {
    return this.prisma.world.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { objects: true } } },
    });
  }

  async getWorld(userId: string, id: string) {
    const world = await this.prisma.world.findFirst({
      where: { id, userId, deletedAt: null },
      include: { objects: { orderBy: { createdAt: 'asc' } } },
    });
    if (!world) throw new VeyraError(ErrorCode.NOT_FOUND, 'World not found');
    return world;
  }

  async download(userId: string, id: string) {
    const world = await this.getWorld(userId, id);
    if (!world.glbKey) throw new VeyraError(ErrorCode.NOT_FOUND, 'World has no exported scene');
    const url = await this.storage.presignDownload(world.glbKey, 900, `${world.name}.glb`);
    return { url, expiresIn: 900, format: 'GLB' };
  }

  async remove(userId: string, id: string) {
    await this.getWorld(userId, id);
    await this.prisma.world.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}
