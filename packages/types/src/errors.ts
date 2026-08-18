/**
 * Structured, machine-readable error codes shared across the platform.
 * The API maps these to HTTP statuses and safe user-facing messages; stack
 * traces are never exposed to clients.
 */
export const ErrorCode = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  INVALID_INPUT: 'INVALID_INPUT',
  GPU_OOM: 'GPU_OOM',
  GENERATION_FAILED: 'GENERATION_FAILED',
  ASSET_PROCESSING_FAILED: 'ASSET_PROCESSING_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  QUALITY_CHECK_FAILED: 'QUALITY_CHECK_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface VeyraErrorShape {
  code: ErrorCode;
  message: string;
  /** Safe details for clients (no secrets, no stack traces). */
  details?: Record<string, unknown>;
  /** Whether retrying the same request may succeed. */
  retryable: boolean;
}

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.PROVIDER_UNAVAILABLE,
  ErrorCode.GPU_OOM,
  ErrorCode.WORKER_TIMEOUT,
  ErrorCode.RATE_LIMITED,
]);

/** Canonical application error. Carries a stable code + retryability. */
export class VeyraError extends Error implements VeyraErrorShape {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: Record<string, unknown>; retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'VeyraError';
    this.code = code;
    this.details = options?.details;
    this.retryable = options?.retryable ?? RETRYABLE.has(code);
  }

  toJSON(): VeyraErrorShape {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }

  static insufficientCredits(required: number, available: number): VeyraError {
    return new VeyraError(ErrorCode.INSUFFICIENT_CREDITS, 'Not enough credits for this operation', {
      details: { required, available },
      retryable: false,
    });
  }

  static providerUnavailable(providerId: string): VeyraError {
    return new VeyraError(ErrorCode.PROVIDER_UNAVAILABLE, `Provider "${providerId}" is unavailable`, {
      details: { providerId },
      retryable: true,
    });
  }
}
