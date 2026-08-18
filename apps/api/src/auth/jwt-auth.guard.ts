import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { verifyAccessToken } from '@veyra/auth';
import { ErrorCode, VeyraError } from '@veyra/types';
import { AppConfigService } from '../config/config.service';
import { buildTokenConfig } from './token-config';

/** Authenticates a UI request via access-token cookie or Bearer header. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown; cookies?: Record<string, string> }>();
    const token = extractToken(req);
    if (!token) {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    try {
      const claims = await verifyAccessToken(token, buildTokenConfig(this.config));
      req.user = { id: claims.sub, role: claims.role, sessionId: claims.sid };
      return true;
    } catch {
      throw new VeyraError(ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
    }
  }
}

function extractToken(req: Request & { cookies?: Record<string, string> }): string | null {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.cookies?.['veyra_access'];
  return cookie ?? null;
}
