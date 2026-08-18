import { Inject, Injectable } from '@nestjs/common';
import { StorageService } from '@veyra/storage';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ModerationService } from '../moderation/moderation.service';
import { STORAGE } from '../storage/storage.module';

/**
 * Public gallery (spec §40). Only assets a user explicitly published appear.
 * Prompts show only when the owner marked them public (spec §81). Likes/views
 * are tracked; publishing runs a moderation screen (spec §41).
 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly moderation: ModerationService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  private ensureEnabled(): void {
    if (!this.flags.get('PUBLIC_GALLERY')) {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'The public gallery is not enabled');
    }
  }

  async list(sort: 'recent' | 'popular' = 'recent', take = 30) {
    this.ensureEnabled();
    const assets = await this.prisma.asset.findMany({
      where: { isPublic: true, deletedAt: null },
      orderBy: sort === 'popular' ? [{ likeCount: 'desc' }, { publishedAt: 'desc' }] : { publishedAt: 'desc' },
      take: Math.min(take, 60),
      select: {
        id: true,
        name: true,
        type: true,
        providerId: true,
        likeCount: true,
        viewCount: true,
        promptPublic: true,
        prompt: true,
        publishedAt: true,
        user: { select: { displayName: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { vertexCount: true, files: { where: { role: 'MODEL' }, select: { storageKey: true, format: true } } },
        },
      },
    });
    return Promise.all(assets.map((a) => this.present(a)));
  }

  async get(assetId: string) {
    this.ensureEnabled();
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, isPublic: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        providerId: true,
        modelFamily: true,
        likeCount: true,
        viewCount: true,
        promptPublic: true,
        prompt: true,
        publishedAt: true,
        user: { select: { displayName: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { vertexCount: true, faceCount: true, files: { where: { role: 'MODEL' }, select: { storageKey: true, format: true } } },
        },
      },
    });
    if (!asset) throw new VeyraError(ErrorCode.NOT_FOUND, 'Asset not found');
    await this.prisma.asset.update({ where: { id: assetId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
    return this.present(asset);
  }

  async setPublic(userId: string, assetId: string, isPublic: boolean, promptPublic?: boolean) {
    this.ensureEnabled();
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new VeyraError(ErrorCode.NOT_FOUND, 'Asset not found');
    if (isPublic) {
      const mod = await this.moderation.checkText(`${asset.name} ${asset.prompt ?? ''}`);
      if (!mod.allowed) {
        throw new VeyraError(ErrorCode.FORBIDDEN, `Cannot publish: ${mod.reason}`);
      }
    }
    return this.prisma.asset.update({
      where: { id: assetId },
      data: {
        isPublic,
        promptPublic: promptPublic ?? asset.promptPublic,
        publishedAt: isPublic ? (asset.publishedAt ?? new Date()) : null,
      },
      select: { id: true, isPublic: true, promptPublic: true },
    });
  }

  async like(userId: string, assetId: string) {
    this.ensureEnabled();
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, isPublic: true, deletedAt: null } });
    if (!asset) throw new VeyraError(ErrorCode.NOT_FOUND, 'Asset not found');
    try {
      await this.prisma.$transaction([
        this.prisma.assetLike.create({ data: { userId, assetId } }),
        this.prisma.asset.update({ where: { id: assetId }, data: { likeCount: { increment: 1 } } }),
      ]);
    } catch {
      // Unique violation — already liked; no-op.
    }
    return { ok: true };
  }

  async unlike(userId: string, assetId: string) {
    this.ensureEnabled();
    const existing = await this.prisma.assetLike.findUnique({ where: { userId_assetId: { userId, assetId } } });
    if (!existing) return { ok: true };
    await this.prisma.$transaction([
      this.prisma.assetLike.delete({ where: { id: existing.id } }),
      this.prisma.asset.update({ where: { id: assetId }, data: { likeCount: { decrement: 1 } } }),
    ]);
    return { ok: true };
  }

  private async present(asset: any) {
    const file = asset.versions?.[0]?.files?.[0];
    const modelUrl = file ? await this.storage.presignDownload(file.storageKey, 900).catch(() => null) : null;
    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      provider: asset.providerId,
      likeCount: asset.likeCount,
      viewCount: asset.viewCount,
      creator: asset.user?.displayName ?? 'Anonymous',
      // Prompt only when the owner made it public.
      prompt: asset.promptPublic ? asset.prompt : null,
      vertexCount: asset.versions?.[0]?.vertexCount ?? null,
      modelUrl,
      publishedAt: asset.publishedAt,
    };
  }
}
