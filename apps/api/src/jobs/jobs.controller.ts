import { Controller, Get, Param, Query, Sse, UseGuards, MessageEvent } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { ErrorCode, VeyraError } from '@veyra/types';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JobEventsService } from './job-events.service';

@Controller({ path: 'jobs', version: '1' })
@UseGuards(HybridAuthGuard)
@ApiScopes('generations:read')
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: JobEventsService,
  ) {}

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const job = await this.prisma.generationJob.findFirst({
      where: { id, userId: user.id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!job) throw new VeyraError(ErrorCode.NOT_FOUND, 'Job not found');
    return job;
  }

  /** Server-Sent Events stream of real progress for a job. */
  @Sse(':id/stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<Observable<MessageEvent>> {
    const job = await this.prisma.generationJob.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true, progress: true },
    });
    if (!job) throw new VeyraError(ErrorCode.NOT_FOUND, 'Job not found');
    return this.events.stream(id).pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.prisma.generationJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 30, 100),
    });
  }
}
