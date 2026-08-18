import type { TokenConfig } from '@veyra/auth';
import type { AppConfigService } from '../config/config.service';

export function buildTokenConfig(config: AppConfigService): TokenConfig {
  return {
    accessSecret: config.env.JWT_ACCESS_SECRET,
    refreshSecret: config.env.JWT_REFRESH_SECRET,
    accessTtlSeconds: config.env.JWT_ACCESS_TTL,
    refreshTtlSeconds: config.env.JWT_REFRESH_TTL,
    issuer: config.branding.short.toLowerCase(),
  };
}
