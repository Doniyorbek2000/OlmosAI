import { Controller, Delete, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { StorageService } from '@veyra/storage';
import { ErrorCode, VeyraError } from '@veyra/types';
import { HybridAuthGuard } from '../api-keys/hybrid-auth.guard';
import { ApiScopes } from '../api-keys/api-scopes.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE } from '../storage/storage.module';
import { buildZip } from './zip';

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

  /** Download a ZIP package: model + metadata.json + export notice (spec §82). */
  @Get(':id/package')
  @ApiScopes('assets:read')
  async package(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.assertOwned(user.id, id);
    const version = await this.prisma.assetVersion.findFirst({
      where: { assetId: asset.id },
      orderBy: { version: 'desc' },
      include: { files: { where: { role: 'MODEL' } } },
    });
    const model = version?.files.find((f) => !f.channel) ?? version?.files[0];
    if (!model) throw new VeyraError(ErrorCode.NOT_FOUND, 'No model file to package');

    const modelBytes = await this.storage.getObject(model.storageKey);
    const metadata = {
      asset: { id: asset.id, name: asset.name, type: asset.type, provider: asset.providerId },
      model: { format: model.format, vertexCount: version?.vertexCount, faceCount: version?.faceCount },
      generatedBy: `${asset.modelFamily ?? ''} ${asset.modelVersion ?? ''}`.trim(),
      seed: asset.seed,
      exportedAt: new Date().toISOString(),
    };
    const notice =
      'Assets generated with VEYRA 3D. Third-party AI model licenses apply — see the platform model registry and THIRD_PARTY_NOTICES.\n';
    const zip = buildZip([
      { name: `model.${model.format.toLowerCase()}`, data: modelBytes },
      { name: 'metadata.json', data: Buffer.from(JSON.stringify(metadata, null, 2)) },
      { name: 'NOTICE.txt', data: Buffer.from(notice) },
    ]);

    const zipKey = `packages/${asset.id}/v${version?.version ?? 1}.zip`;
    await this.storage.putObject(zipKey, zip, 'application/zip');
    const url = await this.storage.presignDownload(zipKey, 900, `${asset.name}.zip`);
    return { url, expiresIn: 900, sizeBytes: zip.length };
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
