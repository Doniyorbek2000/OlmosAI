import { describe, expect, it, beforeEach } from 'vitest';
import { loadEnv, resetEnvCache } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/veyra',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'veyra-assets',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
  JWT_ACCESS_SECRET: 'a-sufficiently-long-secret',
  JWT_REFRESH_SECRET: 'another-sufficiently-long-secret',
  WORKER_SHARED_SECRET: 'workersecret',
} as unknown as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  beforeEach(() => resetEnvCache());

  it('parses a valid environment', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
  });

  it('fails fast when a required var is missing', () => {
    const bad = { ...base } as Record<string, unknown>;
    delete bad.DATABASE_URL;
    expect(() => loadEnv(bad as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('blocks the mock provider in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', PROVIDER_MOCK_ENABLED: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/Mock provider must never be enabled in production/);
  });

  it('blocks default JWT secrets in production', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-access-secret-please-rotate',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Default JWT secrets/);
  });
});
