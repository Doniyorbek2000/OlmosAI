import { Controller, Delete, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { StorageService } from '@veyra/storage';
import { ErrorCode, VeyraError } from '@veyra/types';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE } from '../storage/storage.module';

@Controller({ path: 'assets', version: '1' })
@UseGuards(HybridAuthGuard)
export class AssetsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiScopes('assets:read')
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.prisma.asset.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 50, 100),
      include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { files: true } } },
    });
  }

  @Get(':id')
  @ApiScopes('assets:read')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.assertOwned(user.id, id);
    return this.prisma.asset.findUnique({
      where: { id: asset.id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { files: true, materials: { include: { textures: true } } },
        },
      },
    });
  }

  /** Short-lived signed download URL for a specific asset file. */
  @Get(':id/download')
  @ApiScopes('assets:read')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('versionId') versionId?: string,
  ) {
    const asset = await this.assertOwned(user.id, id);
    const version = await this.prisma.assetVersion.findFirst({
      where: versionId
        ? { id: versionId, assetId: asset.id }
        : { assetId: asset.id },
      orderBy: { version: 'desc' },
      include: { files: { where: { role: 'MODEL' } } },
    });
    // Prefer the main model (no channel) over LOD/collider variants.
    const file = version?.files.find((f) => !f.channel) ?? version?.files[0];
    if (!file) throw new VeyraError(ErrorCode.NOT_FOUND, 'No downloadable model file');
    const url = await this.storage.presignDownload(
      file.storageKey,
      900,
      `${asset.name}.${file.format.toLowerCase()}`,
    );
    return { url, expiresIn: 900, format: file.format };
  }

  @Delete(':id')
  @ApiScopes('assets:write')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.assertOwned(user.id, id);
    await this.prisma.asset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  private async assertOwned(userId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!asset) throw new VeyraError(ErrorCode.NOT_FOUND, 'Asset not found');
    return asset;
  }
}
