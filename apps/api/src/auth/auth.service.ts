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
import { VerificationService } from './verification.service';
import { MailService } from './mail.service';

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
    private readonly verification: VerificationService,
    private readonly mail: MailService,
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

    // Send email verification (dev logs the link when SMTP is absent).
    await this.sendEmailVerification(user.id, user.email);
    return this.issueTokens(user.id, user.role, meta);
  }

  async sendEmailVerification(userId: string, email: string): Promise<void> {
    const token = await this.verification.issue(userId, 'EMAIL_VERIFY', 24 * 3600);
    await this.mail.sendVerificationEmail(email, token);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const userId = await this.verification.consume(rawToken, 'EMAIL_VERIFY');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  }

  /** Always resolves (no account enumeration); only sends if the user exists. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return;
    const token = await this.verification.issue(user.id, 'PASSWORD_RESET', 3600);
    await this.mail.sendPasswordReset(user.email, token);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const userId = await this.verification.consume(rawToken, 'PASSWORD_RESET');
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Reset invalidates every existing session.
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /**
   * Self-serve account deletion (spec §78). Soft-deletes the account + its
   * content, revokes sessions/keys, and marks the user for cleanup rather than
   * leaving orphan records.
   */
  async deleteAccount(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DELETION_PENDING', deletedAt: now },
      });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.apiKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.asset.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.project.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.animationAsset.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.world.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.webhookEndpoint.updateMany({ where: { userId }, data: { enabled: false } });
    });
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
