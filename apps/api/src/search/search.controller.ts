import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cross-entity search over the user's own content (spec §42). PostgreSQL
 * case-insensitive contains for now; the shape lets an OpenSearch backend slot
 * in later without changing the API.
 */
@Controller({ path: 'search', version: '1' })
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { projects: [], assets: [], jobs: [] };
    const contains = { contains: query, mode: 'insensitive' as const };

    const [projects, assets, jobs] = await Promise.all([
      this.prisma.project.findMany({
        where: { userId: user.id, deletedAt: null, name: contains },
        select: { id: true, name: true, type: true },
        take: 10,
      }),
      this.prisma.asset.findMany({
        where: { userId: user.id, deletedAt: null, OR: [{ name: contains }, { prompt: contains }] },
        select: { id: true, name: true, type: true, providerId: true },
        take: 15,
      }),
      this.prisma.generationJob.findMany({
        where: { userId: user.id, OR: [{ kind: { equals: query.toUpperCase() as never } }, { errorCode: contains }] },
        select: { id: true, kind: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return { projects, assets, jobs };
  }
}
