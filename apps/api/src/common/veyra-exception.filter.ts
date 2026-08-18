import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode, VeyraError } from '@veyra/types';

const CODE_TO_STATUS: Record<string, number> = {
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.UNSUPPORTED_FORMAT]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INSUFFICIENT_CREDITS]: 402,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.PROVIDER_UNAVAILABLE]: 503,
  [ErrorCode.WORKER_TIMEOUT]: 504,
  [ErrorCode.GPU_OOM]: 503,
  [ErrorCode.GENERATION_FAILED]: 500,
  [ErrorCode.ASSET_PROCESSING_FAILED]: 500,
  [ErrorCode.QUALITY_CHECK_FAILED]: 422,
  [ErrorCode.INTERNAL]: 500,
};

/**
 * Maps VeyraError + HttpException to safe JSON. Never leaks stack traces
 * (spec §44). Server errors are logged with the request id.
 */
@Catch()
export class VeyraExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const requestId = (ctx.getRequest().id as string) ?? undefined;

    if (exception instanceof VeyraError) {
      const status = CODE_TO_STATUS[exception.code] ?? 500;
      if (status >= 500) this.logger.error(`${exception.code}: ${exception.message}`);
      res.status(status).json({ error: exception.toJSON(), requestId });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json({
        error: {
          code: status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.INVALID_INPUT,
          message: typeof body === 'string' ? body : (body as { message?: string }).message,
          retryable: false,
        },
        requestId,
      });
      return;
    }

    this.logger.error(`Unhandled: ${(exception as Error)?.message}`, (exception as Error)?.stack);
    res.status(500).json({
      error: { code: ErrorCode.INTERNAL, message: 'Internal server error', retryable: false },
      requestId,
    });
  }
}
