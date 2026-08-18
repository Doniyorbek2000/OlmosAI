import { Injectable } from '@nestjs/common';
import { loadEnv, getBranding, featureFlagsFromEnv, type Env } from '@veyra/config';

/** Wraps validated env so the rest of the app injects typed config. */
@Injectable()
export class AppConfigService {
  readonly env: Env = loadEnv();
  readonly branding = getBranding();
  readonly featureFlags = featureFlagsFromEnv();

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
