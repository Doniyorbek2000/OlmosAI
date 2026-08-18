import { Inject, Injectable } from '@nestjs/common';
import { executeWithFallback } from '@veyra/ai-sdk';
import { StorageService } from '@veyra/storage';
import {
  Capability,
  ErrorCode,
  QualityTier,
  TextTo3DStage,
  VeyraError,
  type GenerationInput,
  type JobContext,
  type JobResult,
  type QualityReport,
} from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { AssetQualityService } from '../assets/asset-quality.service';
import { ProviderRegistryService } from '../orchestrator/provider-registry.service';
import { resolveMode } from '../orchestrator/mode-resolver';
import { STORAGE } from '../storage/storage.module';
import { ConceptImageService } from './concept-image.service';
import { parsePrompt, type ParsedPrompt } from './prompt-parser';
import { PrismaStageStore } from './prisma-stage-store';
import { runWorkflow, type WorkflowStage } from './workflow-engine';

/** Persisted job.input for a Text-to-3D job. */
export interface TextTo3DInput {
  prompt: string;
  negativePrompt?: string;
  mode?: string;
  requirePbr?: boolean;
  targetPolygons?: number;
  projectId?: string;
  seed?: number;
}

interface TextCtx extends Record<string, unknown> {
  parsed?: ParsedPrompt;
  enhancedPrompt?: string;
  conceptImageKey?: string;
  imageKey?: string;
  shapeResult?: JobResult;
  report?: QualityReport;
}

export interface TextTo3DOutcome {
  result: JobResult;
  report: QualityReport;
  provenance: {
    prompt: string;
    conceptImageKey: string;
    parsed: ParsedPrompt;
    effectiveInput: GenerationInput;
  };
}

/**
 * Resumable Text-to-3D workflow (spec §6). Strongest models are
 * image-conditioned, so text→3D is an explicit pipeline: analyze → enhance →
 * concept image → preprocess → shape (image-to-3D provider) → texture →
 * postprocess → quality → export. Each stage's output is persisted in
 * GenerationStage; a crashed worker resumes from the last successful stage.
 */
@Injectable()
export class TextTo3DWorkflow {
  constructor(
    private readonly prisma: PrismaService,
    private readonly concept: ConceptImageService,
    private readonly quality: AssetQualityService,
    private readonly orchestrator: ProviderRegistryService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  async run(
    job: { id: string; userId: string; input: TextTo3DInput },
    jobCtx: JobContext,
  ): Promise<TextTo3DOutcome> {
    const store = new PrismaStageStore(this.prisma);
    const input = job.input;
    let effectiveInput: GenerationInput | null = null;

    const stages: WorkflowStage<TextCtx>[] = [
      {
        name: TextTo3DStage.PROMPT_ANALYSIS,
        targetProgress: 8,
        run: async () => ({ parsed: parsePrompt(input.prompt) }),
      },
      {
        name: TextTo3DStage.PROMPT_ENHANCEMENT,
        targetProgress: 14,
        run: async (ctx) => ({ enhancedPrompt: ctx.parsed?.enhancedPrompt ?? input.prompt }),
      },
      {
        name: TextTo3DStage.CONCEPT_IMAGE,
        targetProgress: 35,
        run: async (ctx) => {
          const image = await this.concept.generate(
            job.userId,
            ctx.enhancedPrompt ?? input.prompt,
            input.seed,
          );
          return { conceptImageKey: image.key };
        },
      },
      {
        name: TextTo3DStage.IMAGE_PREPROCESS,
        targetProgress: 44,
        run: async (ctx) => {
          const key = ctx.conceptImageKey;
          if (!key) throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Concept image missing');
          const head = await this.storage.headObject(key);
          if (!head || head.size <= 0) {
            throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Concept image not stored');
          }
          return { imageKey: key };
        },
      },
      {
        name: TextTo3DStage.SHAPE_GENERATION,
        targetProgress: 76,
        run: async (ctx) => {
          const parsed = ctx.parsed!;
          const resolved = resolveMode(
            (input.mode as never) ?? parsed.mode,
            { requirePbr: input.requirePbr ?? parsed.requirePbr, targetPolygons: input.targetPolygons ?? parsed.targetPolygons },
          );
          const gen: GenerationInput = {
            kind: 'image',
            images: [{ key: ctx.imageKey! }],
            quality: resolved.preference.quality ?? QualityTier.STANDARD,
            requirePbr: resolved.preference.requirePbr,
            targetPolygons: input.targetPolygons ?? parsed.targetPolygons,
            outputFormats: ['GLB'],
            seed: input.seed,
          };
          effectiveInput = gen;
          const decision = this.orchestrator.router.route({
            required: [Capability.IMAGE_TO_3D, ...resolved.required.filter((c) => c !== Capability.IMAGE_TO_3D)],
            preference: resolved.preference,
            input: gen,
          });
          // Map provider sub-progress into this stage's 44..76 band.
          const subCtx: JobContext = {
            ...jobCtx,
            reportProgress: async (p, stage, message) => {
              const mapped = 44 + Math.round((Math.min(100, p) / 100) * 32);
              await jobCtx.reportProgress(mapped, stage ?? 'SHAPE_GENERATION', message);
            },
          };
          const result = await executeWithFallback(this.orchestrator.registry, decision, gen, subCtx);
          return { shapeResult: result };
        },
      },
      {
        name: TextTo3DStage.TEXTURE_GENERATION,
        targetProgress: 84,
        // The shape provider already emits color/PBR where supported; a
        // dedicated texture pass (e.g. Hunyuan texture) would run here.
        run: async () => ({}),
      },
      {
        name: TextTo3DStage.POSTPROCESS,
        targetProgress: 90,
        // Heavy geometry ops (remesh/decimate/LOD) are delegated to the
        // asset-worker after export; recorded as a no-op stage here.
        run: async () => ({}),
      },
      {
        name: TextTo3DStage.QUALITY_CHECK,
        targetProgress: 95,
        run: async (ctx) => {
          const model = ctx.shapeResult?.files.find((f) => f.role === 'model');
          if (!model) throw new VeyraError(ErrorCode.GENERATION_FAILED, 'No model produced');
          const report = await this.quality.validate(model.key, ctx.shapeResult?.reportedMetrics ?? {});
          if (!report.passed) {
            throw new VeyraError(
              ErrorCode.QUALITY_CHECK_FAILED,
              `Quality check failed: ${report.issues.join(', ')}`,
              { retryable: false },
            );
          }
          return { report };
        },
      },
      {
        name: TextTo3DStage.EXPORT,
        targetProgress: 98,
        run: async () => ({}),
      },
    ];

    const finalCtx = await runWorkflow<TextCtx>(job.id, stages, store, {}, {
      onProgress: (progress, stage, message) => jobCtx.reportProgress(progress, stage, message),
      isCancelled: () => jobCtx.isCancelled(),
    });

    // On resume, effectiveInput may not have been recomputed; rebuild it.
    if (!effectiveInput) {
      const parsed = finalCtx.parsed ?? parsePrompt(input.prompt);
      effectiveInput = {
        kind: 'image',
        images: [{ key: finalCtx.imageKey ?? finalCtx.conceptImageKey ?? '' }],
        quality: QualityTier.STANDARD,
        requirePbr: input.requirePbr ?? parsed.requirePbr,
        targetPolygons: input.targetPolygons ?? parsed.targetPolygons,
        outputFormats: ['GLB'],
      };
    }

    if (!finalCtx.shapeResult || !finalCtx.report) {
      throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Workflow did not produce a result');
    }

    return {
      result: finalCtx.shapeResult,
      report: finalCtx.report,
      provenance: {
        prompt: input.prompt,
        conceptImageKey: finalCtx.conceptImageKey ?? '',
        parsed: finalCtx.parsed ?? parsePrompt(input.prompt),
        effectiveInput,
      },
    };
  }
}
