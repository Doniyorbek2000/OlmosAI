import {
  type Capability,
  type ProviderHealth,
  ProviderHealthStatus,
  type ThreeDProvider,
} from '@veyra/types';
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';

export interface ProviderRegistration {
  provider: ThreeDProvider;
  enabled: boolean;
  /** Higher = preferred when scores tie. */
  priority: number;
  /** Multiplies estimated cost (admin lever for margins). */
  costMultiplier: number;
  /** Admin "drain" — finish running jobs but accept no new ones. */
  draining?: boolean;
}

interface RegistryEntry extends ProviderRegistration {
  breaker: CircuitBreaker;
  lastHealth?: ProviderHealth;
  failureRate: number; // 0..1 exponential moving average
}

const DEFAULT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 3,
  cooldownMs: 30_000,
};

/**
 * Holds all provider adapters and their operational state (enablement,
 * priority, circuit breaker, recent failure rate, last health).
 */
export class ProviderRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor(private readonly breakerOptions: CircuitBreakerOptions = DEFAULT_BREAKER) {}

  register(reg: ProviderRegistration): void {
    this.entries.set(reg.provider.meta.id, {
      ...reg,
      breaker: new CircuitBreaker(this.breakerOptions),
      failureRate: 0,
    });
  }

  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  all(): RegistryEntry[] {
    return [...this.entries.values()];
  }

  setEnabled(id: string, enabled: boolean): void {
    const e = this.entries.get(id);
    if (e) e.enabled = enabled;
  }

  setDraining(id: string, draining: boolean): void {
    const e = this.entries.get(id);
    if (e) e.draining = draining;
  }

  /** Providers that can currently accept a new job and advertise a capability. */
  availableFor(cap: Capability): RegistryEntry[] {
    return this.all().filter(
      (e) =>
        e.enabled &&
        !e.draining &&
        e.breaker.canAttempt() &&
        e.provider.capabilities().includes(cap),
    );
  }

  recordSuccess(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.breaker.recordSuccess();
    e.failureRate = e.failureRate * 0.7; // decay
  }

  recordFailure(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.breaker.recordFailure();
    e.failureRate = e.failureRate * 0.7 + 0.3; // bump toward 1
  }

  async refreshHealth(id: string): Promise<ProviderHealth> {
    const e = this.entries.get(id);
    if (!e) throw new Error(`unknown provider ${id}`);
    try {
      const health = await e.provider.healthCheck();
      e.lastHealth = health;
      if (health.status === ProviderHealthStatus.UNHEALTHY) e.breaker.recordFailure();
      return health;
    } catch (err) {
      e.breaker.recordFailure();
      const health: ProviderHealth = {
        status: ProviderHealthStatus.UNHEALTHY,
        message: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
      e.lastHealth = health;
      return health;
    }
  }
}
