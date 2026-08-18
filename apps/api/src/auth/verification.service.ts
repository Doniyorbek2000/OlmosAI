import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashToken } from '@veyra/auth';
import { ErrorCode, VeyraError } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';

type Purpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

/**
 * Single-use, expiring tokens for email verification + password reset. Only the
 * SHA-256 hash is stored; the raw token goes in the emailed link (spec §17).
 */
@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, purpose: Purpose, ttlSeconds = 3600): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return raw;
  }

  /** Consume a token atomically; returns the userId or throws. */
  async consume(rawToken: string, purpose: Purpose): Promise<string> {
    const tokenHash = hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.verificationToken.findUnique({ where: { tokenHash } });
      if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt < new Date()) {
        throw new VeyraError(ErrorCode.INVALID_INPUT, 'Invalid or expired token');
      }
      await tx.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      return token.userId;
    });
  }
}
