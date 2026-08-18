import { z } from 'zod';

/**
 * Central environment schema. The application validates on startup and FAILS
 * FAST if required variables are missing or malformed (spec §52). Includes a
 * hard safety rule: the mock provider may never be enabled in production.
 */

const boolFromEnv = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean());

const intFromEnv = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Branding
    VEYRA_BRAND_NAME: z.string().default('VEYRA 3D'),
    VEYRA_BRAND_SHORT: z.string().default('Veyra'),
    VEYRA_API_KEY_PREFIX_LIVE: z.string().default('vyr_live_'),
    VEYRA_API_KEY_PREFIX_TEST: z.string().default('vyr_test_'),

    // URLs
    WEB_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    API_PORT: intFromEnv(4000),

    // Data stores
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    // Object storage
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: boolFromEnv.default('true'),
    S3_PUBLIC_BASE_URL: z.string().url().optional(),

    // Auth
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be >= 16 chars'),
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be >= 16 chars'),
    JWT_ACCESS_TTL: intFromEnv(900),
    JWT_REFRESH_TTL: intFromEnv(1209600),
    AUTH_COOKIE_DOMAIN: z.string().default('localhost'),
    AUTH_COOKIE_SECURE: boolFromEnv.default('false'),

    // Workers
    WORKER_SHARED_SECRET: z.string().min(8),
    ORCHESTRATOR_URL: z.string().url().optional(),
    TRIPOSR_WORKER_URL: z.string().url().optional(),
    TRELLIS2_WORKER_URL: z.string().url().optional(),
    TRIPOSG_WORKER_URL: z.string().url().optional(),
    SF3D_WORKER_URL: z.string().url().optional(),
    HUNYUAN3D_WORKER_URL: z.string().url().optional(),
    ASSET_WORKER_URL: z.string().url().optional(),

    // Provider enablement bootstrap
    PROVIDER_MOCK_ENABLED: boolFromEnv.default('false'),
    PROVIDER_TRIPOSR_ENABLED: boolFromEnv.default('false'),
    PROVIDER_TRELLIS2_ENABLED: boolFromEnv.default('false'),

    // Payments
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Rate limits
    RATE_LIMIT_AUTH_PER_MIN: intFromEnv(10),
    RATE_LIMIT_API_PER_MIN: intFromEnv(60),
    RATE_LIMIT_UI_PER_MIN: intFromEnv(300),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.PROVIDER_MOCK_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PROVIDER_MOCK_ENABLED'],
        message: 'Mock provider must never be enabled in production',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      (env.JWT_ACCESS_SECRET.includes('change-me') || env.JWT_REFRESH_SECRET.includes('change-me'))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'Default JWT secrets are not allowed in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Parse + validate process.env once. Throws a readable error and exits scope. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests. */
export function resetEnvCache(): void {
  cached = null;
}
