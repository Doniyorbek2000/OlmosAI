import { Inject, Injectable } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { StorageService } from '@veyra/storage';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { STORAGE } from '../storage/storage.module';
import { MotionWorkerClient } from './motion-worker.client';
import { MOTION_QUEUE, type MotionJobData } from './motion.queue';

const MOTION_COST = 2;

export interface TextToMotionDto {
  prompt: string;
  durationSeconds?: number;
  fps?: number;
  seed?: number;
  characterAssetId?: string;
  projectId?: string;
  name?: string;
  idempotencyKey?: string;
}

@Injectable()
export class MotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly flags: FeatureFlagsService,
    private readonly worker: MotionWorkerClient,
    @Inject(STORAGE) private readonly storage: StorageService,
    @Inject(MOTION_QUEUE) private readonly queue: BullJobQueue<MotionJobData>,
  ) {}

  async createTextToMotion(userId: string, dto: TextToMotionDto) {
    if (!this.flags.get('MOTION')) {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'Motion generation is not enabled');
    }
    if (!this.worker.enabled) {
      throw new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, 'Motion worker is not available');
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.generationJob.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    if (dto.characterAssetId) {
      const character = await this.prisma.asset.findFirst({
        where: { id: dto.characterAssetId, userId, deletedAt: null },
      });
      if (!character) throw new VeyraError(ErrorCode.NOT_FOUND, 'Character asset not found');
    }

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        projectId: dto.projectId,
        kind: 'MOTION',
        status: 'QUEUED',
        idempotencyKey: dto.idempotencyKey,
        input: {
          prompt: dto.prompt,
          durationSeconds: Math.max(0.2, Math.min(30, dto.durationSeconds ?? 3)),
          fps: Math.max(6, Math.min(60, dto.fps ?? 24)),
          seed: dto.seed,
          characterAssetId: dto.characterAssetId,
          name: dto.name,
        } as unknown as object,
        reservedCredits: MOTION_COST,
      },
    });

    try {
      await this.credits.reserve(userId, job.id, MOTION_COST);
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorCode: ErrorCode.INSUFFICIENT_CREDITS },
      });
      throw err;
    }

    await this.queue.add('text-to-motion', { jobId: job.id, userId }, { jobId: job.id, attempts: 2, backoffMs: 2000 });
    return job;
  }

  listAnimations(userId: string, characterAssetId?: string) {
    return this.prisma.animationAsset.findMany({
      where: { userId, deletedAt: null, ...(characterAssetId ? { characterAssetId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getAnimation(userId: string, id: string) {
    const anim = await this.prisma.animationAsset.findFirst({ where: { id, userId, deletedAt: null } });
    if (!anim) throw new VeyraError(ErrorCode.NOT_FOUND, 'Animation not found');
    return anim;
  }

  async download(userId: string, id: string, format: 'glb' | 'fbx' = 'glb') {
    const anim = await this.getAnimation(userId, id);
    const key = format === 'fbx' ? anim.fbxKey : anim.glbKey;
    if (!key) {
      throw new VeyraError(ErrorCode.NOT_FOUND, `No ${format.toUpperCase()} available for this animation`);
    }
    const url = await this.storage.presignDownload(key, 900, `${anim.name}.${format}`);
    return { url, expiresIn: 900, format: format.toUpperCase() };
  }

  async attach(userId: string, animationId: string, characterAssetId: string) {
    await this.getAnimation(userId, animationId);
    const character = await this.prisma.asset.findFirst({
      where: { id: characterAssetId, userId, deletedAt: null },
    });
    if (!character) throw new VeyraError(ErrorCode.NOT_FOUND, 'Character asset not found');
    return this.prisma.animationAsset.update({
      where: { id: animationId },
      data: { characterAssetId },
    });
  }

  async detach(userId: string, animationId: string) {
    await this.getAnimation(userId, animationId);
    return this.prisma.animationAsset.update({
      where: { id: animationId },
      data: { characterAssetId: null },
    });
  }

  async remove(userId: string, animationId: string) {
    await this.getAnimation(userId, animationId);
    await this.prisma.animationAsset.update({
      where: { id: animationId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
