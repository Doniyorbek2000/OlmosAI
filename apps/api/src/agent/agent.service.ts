import { Injectable } from '@nestjs/common';
import { parsePrompt } from '../workflows/prompt-parser';
import { resolveMode } from '../orchestrator/mode-resolver';
import { buildGameReadyPlan } from '../assets/game-ready';

/**
 * Veyra 3D Agent (spec §37). Converts a natural-language request into a
 * STRUCTURED workflow plan built only from approved operations. It never
 * executes shell commands and never invents operations outside the approved set
 * — it plans; the user (or an execute call) runs it through the normal pipeline.
 */
@Injectable()
export class AgentService {
  plan(prompt: string) {
    const parsed = parsePrompt(prompt);
    const resolved = resolveMode(parsed.mode, {
      requirePbr: parsed.requirePbr,
      targetPolygons: parsed.targetPolygons,
    });
    const gameReady = Boolean(parsed.targetEngine || parsed.targetPolygons);
    const optimization = gameReady
      ? buildGameReadyPlan({
          targetEngine: parsed.targetEngine,
          targetPolygons: parsed.targetPolygons,
          generateLods: true,
          generateCollider: false,
        })
      : null;

    return {
      input: {
        prompt,
        subject: parsed.subject,
        negativePrompt: parsed.negativePrompt,
      },
      generation: {
        method: 'text-to-3d',
        mode: parsed.mode,
        quality: resolved.preference.quality,
        requiredCapabilities: resolved.required,
      },
      geometry: {
        targetPolygons: parsed.targetPolygons ?? null,
        style: parsed.style ?? null,
      },
      materials: {
        pbr: parsed.requirePbr,
      },
      optimization: optimization
        ? { operations: optimization.operations, lods: optimization.lodLevels ?? null }
        : { operations: [], lods: null },
      export: {
        targetEngine: parsed.targetEngine ?? null,
        formats: ['GLB'],
        collider: optimization?.generateCollider ?? false,
      },
      // The plan is executed only through approved endpoints (text-to-3d →
      // game-ready), never arbitrary commands.
      execution: {
        steps: [
          { endpoint: 'POST /v1/generations/text-to-3d', with: { prompt, mode: parsed.mode } },
          ...(gameReady
            ? [{ endpoint: 'POST /v1/assets/:id/game-ready', with: { targetEngine: parsed.targetEngine, targetPolygons: parsed.targetPolygons } }]
            : []),
        ],
      },
    };
  }
}
