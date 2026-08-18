import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import { verifyAccessToken } from '@veyra/auth';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AppConfigService } from '../config/config.service';
import { buildTokenConfig } from '../auth/token-config';
import { REDIS } from '../redis/redis.module';
import { ApiKeyService } from './api-key.service';
import { API_SCOPES_KEY } from './api-scopes.decorator';

/**
 * Authenticates a request via EITHER an API key (Authorization: Bearer vyr_...)
 * or a UI session (JWT cookie/bearer). API-key requests are scope-checked and
 * rate-limited per key (Redis); UI requests get full access. Sets req.user and,
 * for key requests, req.apiKey so the usage interceptor can log.
 */
@Injectable()
export class HybridAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly config: AppConfigService,
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: unknown; apiKey?: unknown; cookies?: Record<string, string> }>();
    const header = req.header('authorization');
    const { apiKeyPrefixLive, apiKeyPrefixTest } = this.config.branding;

    // ---- API key path -----------------------------------------------------
    if (
      header?.startsWith('Bearer ') &&
      (header.slice(7).startsWith(apiKeyPrefixLive) || header.slice(7).startsWith(apiKeyPrefixTest))
    ) {
      const raw = header.slice(7);
      const auth = await this.apiKeys.authenticate(raw);
      if (!auth) throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid API key');

      await this.enforceRateLimit(auth.apiKeyId);

      const required = this.reflector.getAllAndOverride<string[]>(API_SCOPES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (required?.length) {
        const missing = required.filter((s) => !auth.scopes.includes(s));
        if (missing.length) {
          throw new VeyraError(ErrorCode.FORBIDDEN, `Missing scopes: ${missing.join(', ')}`);
        }
      }
      req.user = { id: auth.userId, role: 'USER', apiKeyId: auth.apiKeyId, scopes: auth.scopes };
      req.apiKey = { id: auth.apiKeyId };
      return true;
    }

    // ---- JWT / session path ----------------------------------------------
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.['veyra_access'];
    if (!token) throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Authentication required');
    try {
      const claims = await verifyAccessToken(token, buildTokenConfig(this.config));
      req.user = { id: claims.sub, role: claims.role, sessionId: claims.sid };
      return true;
    } catch {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
    }
  }

  private async enforceRateLimit(apiKeyId: string): Promise<void> {
    const limit = this.config.env.RATE_LIMIT_API_PER_MIN;
    const bucket = `ratelimit:apikey:${apiKeyId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(bucket);
    if (count === 1) await this.redis.expire(bucket, 65);
    if (count > limit) {
      throw new VeyraError(ErrorCode.RATE_LIMITED, 'API rate limit exceeded', {
        details: { limitPerMinute: limit },
      });
    }
  }
}
