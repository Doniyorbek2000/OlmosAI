import { Inject, Injectable } from '@nestjs/common';
import type { BullJobQueue } from '@veyra/queue';
import { ErrorCode, GenerationMode, VeyraError, type GenerationInput } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../billing/credits.service';
import { ProviderRegistryService } from '../orchestrator/provider-registry.service';
import { resolveMode } from '../orchestrator/mode-resolver';
import { parsePrompt } from '../workflows/prompt-parser';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { GENERATION_QUEUE, type GenerationJobData } from './generation-queue';
import type { ImageTo3DDto, TextTo3DDto } from './dto';

@Injectable()
export class GenerationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly orchestrator: ProviderRegistryService,
    private readonly flags: FeatureFlagsService,
    @Inject(GENERATION_QUEUE) private readonly queue: BullJobQueue<GenerationJobData>,
  ) {}

  async createImageTo3D(userId: string, dto: ImageTo3DDto) {
    if (!this.flags.get('IMAGE_TO_3D')) {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'Image-to-3D is not enabled');
    }

    // Idempotency: same key returns the existing job (spec §71).
    if (dto.idempotencyKey) {
      const existing = await this.prisma.generationJob.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const mode = (dto.mode as GenerationMode) ?? GenerationMode.BALANCED;
    const resolved = resolveMode(mode, {
      requirePbr: dto.requirePbr,
      targetPolygons: dto.targetPolygons,
    });

    const input: GenerationInput = {
      kind: dto.images.length > 1 ? 'multi-image' : 'image',
      images: dto.images.map((i) => ({ key: i.key, view: i.view })),
      quality: resolved.preference.quality,
      requirePbr: resolved.preference.requirePbr,
      targetPolygons: dto.targetPolygons,
      outputFormats: ['GLB'],
    };

    // Route now (also validates at least one provider is available) and estimate
    // cost from the top provider in the chain.
    const decision = this.orchestrator.router.route({
      required: resolved.required,
      preference: resolved.preference,
      input,
    });
    const topProvider = decision.chain[0];
    const estimate = await topProvider.estimateCost(input);

    // Verify project ownership if provided.
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, userId, deletedAt: null },
      });
      if (!project) throw new VeyraError(ErrorCode.NOT_FOUND, 'Project not found');
    }

    // Create the job, then reserve credits (job id ties the reservation).
    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        projectId: dto.projectId,
        kind: input.kind === 'multi-image' ? 'MULTI_IMAGE_TO_3D' : 'IMAGE_TO_3D',
        status: 'QUEUED',
        mode,
        idempotencyKey: dto.idempotencyKey,
        input: input as unknown as object,
        reservedCredits: estimate.credits,
        routingTrace: decision.trace as unknown as object,
      },
    });

    try {
      await this.credits.reserve(userId, job.id, estimate.credits);
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorCode: ErrorCode.INSUFFICIENT_CREDITS, errorMessage: 'Insufficient credits' },
      });
      throw err;
    }

    // Enqueue (BullMQ jobId = our job id → dedupe/idempotent dispatch).
    await this.queue.add('image-to-3d', { jobId: job.id, userId }, { jobId: job.id, attempts: 2, backoffMs: 2000 });

    return job;
  }

  async createTextTo3D(userId: string, dto: TextTo3DDto) {
    if (!this.flags.get('TEXT_TO_3D')) {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'Text-to-3D is not enabled');
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.generationJob.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const parsed = parsePrompt(dto.prompt);
    const mode = (dto.mode as GenerationMode) ?? parsed.mode;
    const requirePbr = dto.requirePbr ?? parsed.requirePbr;
    const targetPolygons = dto.targetPolygons ?? parsed.targetPolygons;
    const resolved = resolveMode(mode, { requirePbr, targetPolygons });

    // Estimate cost from the top routed provider (images not needed for the
    // estimate; the concept image is generated during the workflow).
    const estimateInput: GenerationInput = {
      kind: 'image',
      images: [],
      quality: resolved.preference.quality,
      requirePbr,
      targetPolygons,
      outputFormats: ['GLB'],
    };
    const decision = this.orchestrator.router.route({
      required: resolved.required,
      preference: resolved.preference,
      input: estimateInput,
    });
    const estimate = await decision.chain[0].estimateCost(estimateInput);
    // Text-to-3D adds a concept-image step: a small credit surcharge.
    const credits = estimate.credits + 1;

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, userId, deletedAt: null },
      });
      if (!project) throw new VeyraError(ErrorCode.NOT_FOUND, 'Project not found');
    }

    const jobInput = {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt ?? parsed.negativePrompt,
      mode,
      requirePbr,
      targetPolygons,
      projectId: dto.projectId,
      seed: dto.seed,
    };

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        projectId: dto.projectId,
        kind: 'TEXT_TO_3D',
        status: 'QUEUED',
        mode,
        idempotencyKey: dto.idempotencyKey,
        input: jobInput as unknown as object,
        reservedCredits: credits,
        routingTrace: decision.trace as unknown as object,
      },
    });

    try {
      await this.credits.reserve(userId, job.id, credits);
    } catch (err) {
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorCode: ErrorCode.INSUFFICIENT_CREDITS, errorMessage: 'Insufficient credits' },
      });
      throw err;
    }

    await this.queue.add('text-to-3d', { jobId: job.id, userId }, { jobId: job.id, attempts: 2, backoffMs: 2000 });
    return job;
  }

  async get(userId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, userId },
      include: { stages: { orderBy: { order: 'asc' } }, cost: true },
    });
    if (!job) throw new VeyraError(ErrorCode.NOT_FOUND, 'Job not found');
    return job;
  }

  async list(userId: string, take = 30) {
    return this.prisma.generationJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
    });
  }

  async cancel(userId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new VeyraError(ErrorCode.NOT_FOUND, 'Job not found');
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
    return this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }
}
