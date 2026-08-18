import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type FeatureFlagState } from '@veyra/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';

const SETTING_KEY = 'feature_flags';

/**
 * Server-controlled feature flags (spec §62). Env provides bootstrap defaults;
 * a DB SystemSetting overrides them at runtime so flags change without a
 * frontend redeploy. Cached in-memory and refreshed periodically so reads stay
 * synchronous on the hot path.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit, OnModuleDestroy {
  private state: FeatureFlagState;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    this.state = { ...config.featureFlags };
  }

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get(flag: keyof FeatureFlagState): boolean {
    return this.state[flag];
  }

  all(): FeatureFlagState {
    return { ...this.state };
  }

  async refresh(): Promise<void> {
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
      const overrides = (row?.value as Partial<FeatureFlagState>) ?? {};
      this.state = { ...this.config.featureFlags, ...overrides };
    } catch {
      // Keep the last-known-good (env defaults) if the DB is unreachable.
    }
  }

  /** Admin: persist an override, then refresh the cache. */
  async setFlag(flag: keyof FeatureFlagState, enabled: boolean): Promise<FeatureFlagState> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const current = (row?.value as Partial<FeatureFlagState>) ?? {};
    const next = { ...current, [flag]: enabled };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: next as object },
      create: { key: SETTING_KEY, value: next as object },
    });
    await this.refresh();
    return this.all();
  }
}
