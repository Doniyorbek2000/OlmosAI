import { describe, expect, it } from 'vitest';
import { ErrorCode, VeyraError } from './errors.js';

describe('VeyraError', () => {
  it('marks provider-unavailable as retryable by default', () => {
    const err = VeyraError.providerUnavailable('trellis2');
    expect(err.code).toBe(ErrorCode.PROVIDER_UNAVAILABLE);
    expect(err.retryable).toBe(true);
    expect(err.details).toEqual({ providerId: 'trellis2' });
  });

  it('marks insufficient-credits as non-retryable', () => {
    const err = VeyraError.insufficientCredits(10, 3);
    expect(err.code).toBe(ErrorCode.INSUFFICIENT_CREDITS);
    expect(err.retryable).toBe(false);
    expect(err.details).toEqual({ required: 10, available: 3 });
  });

  it('serialises to a safe JSON shape without a stack trace', () => {
    const json = new VeyraError(ErrorCode.INVALID_INPUT, 'bad').toJSON();
    expect(json).toEqual({
      code: 'INVALID_INPUT',
      message: 'bad',
      details: undefined,
      retryable: false,
    });
    expect((json as Record<string, unknown>).stack).toBeUndefined();
  });

  it('allows explicit retryable override', () => {
    const err = new VeyraError(ErrorCode.INVALID_INPUT, 'x', { retryable: true });
    expect(err.retryable).toBe(true);
  });
});
