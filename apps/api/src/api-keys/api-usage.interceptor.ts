import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { ApiKeyService } from './api-key.service';

/**
 * Records ApiUsage for API-key-authenticated requests after the response is
 * produced (spec §31 usage tracking). No-op for UI/session requests.
 */
@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiKeys: ApiKeyService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { apiKey?: { id: string } }>();
    const apiKeyId = req.apiKey?.id;
    if (!apiKeyId) return next.handle();

    const endpoint = req.route?.path ?? req.path;
    const method = req.method;
    const record = (status: number) =>
      void this.apiKeys.recordUsage(apiKeyId, endpoint, method, status);

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.switchToHttp().getResponse<Response>();
          record(res.statusCode ?? 200);
        },
        error: (err) => record((err?.status as number) ?? 500),
      }),
    );
  }
}
