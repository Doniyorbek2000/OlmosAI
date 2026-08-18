/**
 * Per-provider circuit breaker. Repeated failures open the circuit, stopping
 * new jobs; after a cooldown it half-opens and a probe decides whether to
 * close (restore) or re-open.
 */
export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;
export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. */
  failureThreshold: number;
  /** Milliseconds to stay open before allowing a probe. */
  cooldownMs: number;
  /** Clock injection for tests. */
  now?: () => number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  /** Whether a new request may be attempted right now. */
  canAttempt(): boolean {
    return this.getState() !== CircuitState.OPEN;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = CircuitState.CLOSED;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (
      this.state === CircuitState.HALF_OPEN ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = this.now();
  }

  private maybeHalfOpen(): void {
    if (this.state === CircuitState.OPEN && this.now() - this.openedAt >= this.options.cooldownMs) {
      this.state = CircuitState.HALF_OPEN;
    }
  }
}
