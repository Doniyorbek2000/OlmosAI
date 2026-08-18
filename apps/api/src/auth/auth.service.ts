import { Injectable } from '@nestjs/common';
import {
  generateRefreshToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
} from '@veyra/auth';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { buildTokenConfig } from './token-config';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTtl: number;
  refreshTtl: number;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    displayName: string | undefined,
    meta: SessionMeta,
  ): Promise<AuthTokens> {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new VeyraError(ErrorCode.CONFLICT, 'An account with this email already exists');
    }
    const passwordHash = await hashPassword(password);
    const freePlan = await this.prisma.plan.findUnique({ where: { key: 'FREE' } });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalized,
          passwordHash,
          displayName: displayName ?? normalized.split('@')[0],
          creditBalance: { create: { balance: freePlan?.monthlyCredits ?? 30 } },
          settings: { create: {} },
        },
      });
      if (freePlan) {
        await tx.subscription.create({
          data: { userId: created.id, planId: freePlan.id, status: 'ACTIVE' },
        });
        await tx.creditTransaction.create({
          data: {
            userId: created.id,
            type: 'GRANT',
            amount: freePlan.monthlyCredits,
            reason: 'Signup grant (FREE plan)',
          },
        });
      }
      return created;
    });

    return this.issueTokens(user.id, user.role, meta);
  }

  async login(email: string, password: string, meta: SessionMeta): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }
    if (user.status !== 'ACTIVE') {
      throw new VeyraError(ErrorCode.FORBIDDEN, 'Account is not active');
    }
    return this.issueTokens(user.id, user.role, meta);
  }

  /** Rotating refresh: consumes the old session, issues a new one. */
  async refresh(rawRefreshToken: string, meta: SessionMeta): Promise<AuthTokens> {
    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid or expired session');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.userId, session.user.role, meta, session.id);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    role: string,
    meta: SessionMeta,
    rotatedFromId?: string,
  ): Promise<AuthTokens> {
    const tokenConfig = buildTokenConfig(this.config);
    const refresh = generateRefreshToken();
    const expiresAt = new Date(Date.now() + tokenConfig.refreshTtlSeconds * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: refresh.hash,
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt,
        rotatedFromId,
      },
    });
    const accessToken = await signAccessToken({ sub: userId, role, sid: session.id }, tokenConfig);
    return {
      accessToken,
      refreshToken: refresh.raw,
      accessTtl: tokenConfig.accessTtlSeconds,
      refreshTtl: tokenConfig.refreshTtlSeconds,
    };
  }
}
