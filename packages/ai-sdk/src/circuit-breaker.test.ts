import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitState } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and blocks attempts', () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: () => t });
    expect(cb.canAttempt()).toBe(true);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    cb.recordFailure();
    expect(cb.getState()).toBe(CircuitState.OPEN);
    expect(cb.canAttempt()).toBe(false);
  });

  it('half-opens after cooldown then closes on success', () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: () => t });
    cb.recordFailure();
    expect(cb.getState()).toBe(CircuitState.OPEN);
    t = 1000;
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    expect(cb.canAttempt()).toBe(true);
    cb.recordSuccess();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('re-opens if the half-open probe fails', () => {
    let t = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 500, now: () => t });
    cb.recordFailure();
    t = 500;
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    cb.recordFailure();
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });
});
