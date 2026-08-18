import {
  type Capability,
  type GenerationInput,
  ProviderHealthStatus,
  type RoutingPreference,
  type ThreeDProvider,
  VeyraError,
} from '@veyra/types';
import type { ProviderRegistry } from './registry.js';

export interface RouteRequest {
  /** Capabilities the chosen provider MUST advertise. */
  required: Capability[];
  preference: RoutingPreference;
  input: GenerationInput;
}

export interface RouteDecision {
  /** Ordered fallback chain — try [0], then [1], etc. */
  chain: ThreeDProvider[];
  /** Human-readable scoring trace for observability/admin. */
  trace: Array<{ providerId: string; score: number; reasons: string[] }>;
}

/**
 * Scores enabled + healthy providers for a request and returns an ordered
 * fallback chain. Never fails immediately if one provider is down — it returns
 * every eligible provider so the executor can retry down the chain.
 */
export class ModelRouter {
  constructor(private readonly registry: ProviderRegistry) {}

  route(req: RouteRequest): RouteDecision {
    // A provider must satisfy ALL required capabilities.
    const candidates = this.registry
      .all()
      .filter(
        (e) =>
          e.enabled &&
          !e.draining &&
          e.breaker.canAttempt() &&
          req.required.every((c) => e.provider.capabilities().includes(c)),
      );

    const trace = candidates.map((e) => {
      const reasons: string[] = [];
      let score = 0;

      // Base priority.
      score += e.priority;
      reasons.push(`priority+${e.priority}`);

      // Health.
      const h = e.lastHealth;
      if (h?.status === ProviderHealthStatus.HEALTHY) {
        score += 40;
        reasons.push('healthy+40');
      } else if (h?.status === ProviderHealthStatus.DEGRADED) {
        score += 10;
        reasons.push('degraded+10');
      } else if (h?.status === ProviderHealthStatus.UNHEALTHY) {
        score -= 100;
        reasons.push('unhealthy-100');
      }

      // Recent failure rate penalty.
      const failPenalty = Math.round(e.failureRate * 60);
      score -= failPenalty;
      if (failPenalty) reasons.push(`failRate-${failPenalty}`);

      // Queue load penalty.
      const depth = h?.queueDepth ?? 0;
      const queuePenalty = Math.min(30, depth * 3);
      score -= queuePenalty;
      if (queuePenalty) reasons.push(`queue-${queuePenalty}`);

      // Speed preference: FAST_GENERATION providers gain when speed matters.
      if (req.preference.speedWeight > 0.5 && e.provider.capabilities().includes('FAST_GENERATION' as Capability)) {
        const bonus = Math.round(req.preference.speedWeight * 30);
        score += bonus;
        reasons.push(`fast+${bonus}`);
      }

      // Quality preference: HIGH_QUALITY providers gain when quality matters.
      if (
        (req.preference.quality === 'HIGH' || req.preference.quality === 'ULTRA') &&
        e.provider.capabilities().includes('HIGH_QUALITY' as Capability)
      ) {
        score += 35;
        reasons.push('quality+35');
      }

      // PBR requirement is a hard-ish filter expressed as a strong bonus.
      if (req.preference.requirePbr) {
        const pbr =
          e.provider.capabilities().includes('PBR_3D' as Capability) ||
          e.provider.capabilities().includes('PBR_TEXTURE' as Capability);
        if (pbr) {
          score += 50;
          reasons.push('pbr+50');
        } else {
          score -= 80;
          reasons.push('noPbr-80');
        }
      }

      // Cost preference (admin cost multiplier as proxy).
      const costPenalty = Math.round(req.preference.costWeight * (e.costMultiplier - 1) * 40);
      score -= costPenalty;
      if (costPenalty) reasons.push(`cost-${costPenalty}`);

      return { providerId: e.provider.meta.id, score, reasons };
    });

    trace.sort((a, b) => b.score - a.score);

    const chain = trace
      .map((t) => this.registry.get(t.providerId)?.provider)
      .filter((p): p is ThreeDProvider => Boolean(p));

    if (chain.length === 0) {
      throw VeyraError.providerUnavailable(req.required.join('+'));
    }

    return { chain, trace };
  }
}
