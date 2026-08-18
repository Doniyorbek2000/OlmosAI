import { Injectable } from '@nestjs/common';
import { generateApiKey, hashApiKey } from '@veyra/auth';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

export const API_SCOPES = [
  'generations:read',
  'generations:write',
  'assets:read',
  'assets:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface AuthenticatedKey {
  userId: string;
  apiKeyId: string;
  scopes: string[];
  livemode: boolean;
}

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Resolve a raw key to its owner + scopes, or null if invalid. */
  async authenticate(rawKey: string): Promise<AuthenticatedKey | null> {
    const { apiKeyPrefixLive, apiKeyPrefixTest } = this.config.branding;
    if (!rawKey.startsWith(apiKeyPrefixLive) && !rawKey.startsWith(apiKeyPrefixTest)) {
      return null;
    }
    const keyHash = hashApiKey(rawKey);
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
      return null;
    }
    // Best-effort last-used stamp; never blocks the request.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { userId: key.userId, apiKeyId: key.id, scopes: key.scopes, livemode: key.livemode };
  }

  async create(userId: string, name: string, scopes: string[], livemode: boolean) {
    const invalid = scopes.filter((s) => !API_SCOPES.includes(s as ApiScope));
    if (invalid.length) {
      throw new VeyraError(ErrorCode.INVALID_INPUT, `Unknown scopes: ${invalid.join(', ')}`);
    }
    const generated = generateApiKey({
      livemode,
      livePrefix: this.config.branding.apiKeyPrefixLive,
      testPrefix: this.config.branding.apiKeyPrefixTest,
    });
    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        name,
        prefix: generated.prefix,
        keyHash: generated.hash,
        last4: generated.last4,
        scopes: scopes.length ? scopes : [...API_SCOPES],
        livemode,
      },
    });
    // Plaintext is returned exactly once and never stored.
    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      last4: record.last4,
      scopes: record.scopes,
      livemode: record.livemode,
      key: generated.plaintext,
    };
  }

  list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        last4: true,
        scopes: true,
        livemode: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(userId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id, userId, revokedAt: null } });
    if (!key) throw new VeyraError(ErrorCode.NOT_FOUND, 'API key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async recordUsage(apiKeyId: string, endpoint: string, method: string, status: number, credits = 0) {
    await this.prisma.apiUsage
      .create({ data: { apiKeyId, endpoint, method, status, creditsCharged: credits } })
      .catch(() => undefined);
  }
}
