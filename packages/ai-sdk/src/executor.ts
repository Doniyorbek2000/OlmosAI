import {
  type GenerationInput,
  type JobContext,
  type JobResult,
  VeyraError,
  ErrorCode,
} from '@veyra/types';
import type { ProviderRegistry } from './registry.js';
import type { RouteDecision } from './router.js';

export interface ExecuteOptions {
  /** Max providers to try from the chain. */
  maxProviders?: number;
  /** Attempts per provider before moving to the next. */
  attemptsPerProvider?: number;
}

/**
 * Runs a generation across a routed fallback chain, honoring circuit breakers
 * and retrying on retryable failures. Does not fail on the first provider being
 * down — it walks the chain. Non-retryable errors (e.g. invalid input) stop
 * immediately.
 */
export async function executeWithFallback(
  registry: ProviderRegistry,
  decision: RouteDecision,
  input: GenerationInput,
  ctx: JobContext,
  options: ExecuteOptions = {},
): Promise<JobResult> {
  const maxProviders = options.maxProviders ?? decision.chain.length;
  const attemptsPerProvider = options.attemptsPerProvider ?? 1;
  const errors: Array<{ providerId: string; error: VeyraError }> = [];

  for (const provider of decision.chain.slice(0, maxProviders)) {
    const id = provider.meta.id;
    const entry = registry.get(id);
    if (entry && !entry.breaker.canAttempt()) continue;

    for (let attempt = 0; attempt < attemptsPerProvider; attempt++) {
      if (ctx.isCancelled()) {
        throw new VeyraError(ErrorCode.GENERATION_FAILED, 'Job cancelled', { retryable: false });
      }
      try {
        const result = await provider.generate(input, ctx);
        registry.recordSuccess(id);
        return result;
      } catch (err) {
        const verr =
          err instanceof VeyraError
            ? err
            : new VeyraError(ErrorCode.GENERATION_FAILED, String(err), { retryable: true });
        registry.recordFailure(id);
        errors.push({ providerId: id, error: verr });
        if (!verr.retryable) {
          throw verr; // e.g. invalid input — don't fall back
        }
        // else: retry same provider or fall through to next
      }
    }
  }

  throw new VeyraError(ErrorCode.GENERATION_FAILED, 'All providers failed', {
    details: { attempts: errors.map((e) => ({ providerId: e.providerId, code: e.error.code })) },
    retryable: false,
  });
}
