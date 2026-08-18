import { StageStatus } from '@veyra/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { StageStore } from './workflow-engine';

/** GenerationStage-backed persistence for the workflow engine. */
export class PrismaStageStore implements StageStore {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(jobId: string, stages: { name: string; order: number }[]): Promise<void> {
    // Idempotent: create missing PENDING rows, leave existing ones untouched.
    await this.prisma.$transaction(
      stages.map((s) =>
        this.prisma.generationStage.upsert({
          where: { jobId_name: { jobId, name: s.name } },
          update: { order: s.order },
          create: { jobId, name: s.name, order: s.order, status: StageStatus.PENDING },
        }),
      ),
    );
  }

  async get(jobId: string, name: string): Promise<{ status: StageStatus; output: unknown } | null> {
    const row = await this.prisma.generationStage.findUnique({
      where: { jobId_name: { jobId, name } },
    });
    if (!row) return null;
    return { status: row.status as StageStatus, output: row.output };
  }

  async start(jobId: string, name: string): Promise<void> {
    await this.prisma.generationStage.update({
      where: { jobId_name: { jobId, name } },
      data: { status: StageStatus.RUNNING, startedAt: new Date(), errorMessage: null },
    });
  }

  async complete(jobId: string, name: string, output: unknown): Promise<void> {
    await this.prisma.generationStage.update({
      where: { jobId_name: { jobId, name } },
      data: {
        status: StageStatus.COMPLETED,
        completedAt: new Date(),
        output: (output ?? {}) as object,
      },
    });
  }

  async fail(jobId: string, name: string, error: string): Promise<void> {
    await this.prisma.generationStage.update({
      where: { jobId_name: { jobId, name } },
      data: { status: StageStatus.FAILED, errorMessage: error.slice(0, 1000) },
    });
  }
}
