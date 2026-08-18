/** Branding is fully env-driven so the product name can change without refactor. */
export interface Branding {
  name: string;
  short: string;
  apiKeyPrefixLive: string;
  apiKeyPrefixTest: string;
}

export function getBranding(env: NodeJS.ProcessEnv = process.env): Branding {
  return {
    name: env.VEYRA_BRAND_NAME ?? 'VEYRA 3D',
    short: env.VEYRA_BRAND_SHORT ?? 'Veyra',
    apiKeyPrefixLive: env.VEYRA_API_KEY_PREFIX_LIVE ?? 'vyr_live_',
    apiKeyPrefixTest: env.VEYRA_API_KEY_PREFIX_TEST ?? 'vyr_test_',
  };
}
