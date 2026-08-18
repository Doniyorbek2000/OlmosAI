import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AppConfigService } from '../config/config.service';
import { REDIS } from '../redis/redis.module';

/**
 * Redis-backed per-IP rate limit for unauthenticated auth endpoints (register/
 * login/forgot-password) to blunt credential stuffing + enumeration (spec §83).
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const route = req.path;
    const limit = this.config.env.RATE_LIMIT_AUTH_PER_MIN;
    const bucket = `ratelimit:auth:${route}:${ip}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(bucket);
    if (count === 1) await this.redis.expire(bucket, 65);
    if (count > limit) {
      throw new VeyraError(ErrorCode.RATE_LIMITED, 'Too many attempts, please try again shortly', {
        details: { limitPerMinute: limit },
      });
    }
    return true;
  }
}
