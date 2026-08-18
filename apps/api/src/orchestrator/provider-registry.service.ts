import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  HttpWorkerTransport,
  MockProvider,
  ModelRouter,
  ProviderRegistry,
  createSf3d,
  createTrellis2,
  createTripoSG,
  createTripoSR,
} from '@veyra/ai-sdk';
import type { ThreeDProvider } from '@veyra/types';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

/**
 * Assembles the provider registry from DB `AIProvider` rows + env worker URLs,
 * and exposes the router. Provider enablement/priority/cost/drain are DB-driven
 * so admins can change them at runtime (spec §53, §89).
 */
@Injectable()
export class ProviderRegistryService implements OnModuleInit {
  private readonly logger = new Logger('Orchestrator');
  readonly registry = new ProviderRegistry();
  readonly router = new ModelRouter(this.registry);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** (Re)build the registry from DB rows. Safe to call on admin changes. */
  async reload(): Promise<void> {
    const rows = await this.prisma.aIProvider.findMany().catch(() => []);
    const byId = new Map(rows.map((r) => [r.providerId, r]));
    const secret = this.config.env.WORKER_SHARED_SECRET;

    const register = (
      id: string,
      provider: ThreeDProvider,
      defaults: { enabled: boolean; priority: number },
    ) => {
      const row = byId.get(id);
      // In production, only DB-enabled providers run. Mock never runs in prod
      // (config validation also blocks it).
      const enabled =
        row?.enabled ??
        (id === 'mock' ? this.config.env.PROVIDER_MOCK_ENABLED : defaults.enabled);
      this.registry.register({
        provider,
        enabled: enabled && !(id === 'mock' && this.config.isProduction),
        priority: row?.priority ?? defaults.priority,
        costMultiplier: row?.costMultiplier ?? 1,
        draining: row?.draining ?? false,
      });
    };

    // Mock provider (dev only).
    register('mock', new MockProvider(), { enabled: this.config.env.PROVIDER_MOCK_ENABLED, priority: 1 });

    // Worker-backed providers (registered when a worker URL is configured).
    const transports: Array<[string, string | undefined, (t: HttpWorkerTransport) => ThreeDProvider, { enabled: boolean; priority: number }]> = [
      ['triposr', this.config.env.TRIPOSR_WORKER_URL, createTripoSR, { enabled: true, priority: 60 }],
      ['trellis2', this.config.env.TRELLIS2_WORKER_URL, createTrellis2, { enabled: false, priority: 100 }],
      ['triposg', this.config.env.TRIPOSG_WORKER_URL, createTripoSG, { enabled: false, priority: 80 }],
      ['sf3d', this.config.env.SF3D_WORKER_URL, createSf3d, { enabled: false, priority: 55 }],
    ];

    for (const [id, url, factory, defaults] of transports) {
      if (!url) continue;
      const transport = new HttpWorkerTransport({ baseUrl: url, sharedSecret: secret });
      register(id, factory(transport), defaults);
    }

    this.logger.log(
      `Providers: ${this.registry
        .all()
        .map((e) => `${e.provider.meta.id}${e.enabled ? '' : '(off)'}`)
        .join(', ')}`,
    );
  }

  /** Refresh health for all providers (called periodically by the worker). */
  async refreshAllHealth(): Promise<void> {
    await Promise.all(this.registry.all().map((e) => this.registry.refreshHealth(e.provider.meta.id)));
  }
}
