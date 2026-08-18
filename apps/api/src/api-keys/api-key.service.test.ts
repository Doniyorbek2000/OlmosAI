import { describe, expect, it, beforeEach } from 'vitest';
import { ApiKeyService } from './api-key.service';

function makeFake() {
  const byHash = new Map<string, any>();
  const prisma: any = {
    apiKey: {
      create: async ({ data }: any) => {
        const row = { id: `key_${byHash.size + 1}`, createdAt: new Date(), ...data };
        byHash.set(data.keyHash, row);
        return row;
      },
      findUnique: async ({ where }: any) => byHash.get(where.keyHash) ?? null,
      update: async ({ where, data }: any) => {
        const row = [...byHash.values()].find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      findMany: async () => [...byHash.values()],
      findFirst: async ({ where }: any) =>
        [...byHash.values()].find((r) => r.id === where.id && !r.revokedAt) ?? null,
    },
    apiUsage: { create: async () => ({}) },
  };
  return { prisma, byHash };
}

const config: any = {
  branding: { apiKeyPrefixLive: 'vyr_live_', apiKeyPrefixTest: 'vyr_test_' },
};

describe('ApiKeyService', () => {
  let fake: ReturnType<typeof makeFake>;
  let service: ApiKeyService;

  beforeEach(() => {
    fake = makeFake();
    service = new ApiKeyService(fake.prisma as never, config);
  });

  it('creates a key, returns plaintext once, and stores only the hash', async () => {
    const created = await service.create('u1', 'CI key', ['generations:write'], true);
    expect(created.key.startsWith('vyr_live_')).toBe(true);
    expect(created.last4.length).toBe(4);
    // Stored row has a hash, never the plaintext.
    const stored = [...fake.byHash.values()][0];
    expect(stored.keyHash).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(created.key);
  });

  it('rejects unknown scopes', async () => {
    await expect(service.create('u1', 'bad', ['nope:write'], false)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('authenticates a valid key and returns owner + scopes', async () => {
    const created = await service.create('u1', 'k', ['assets:read'], false);
    const auth = await service.authenticate(created.key);
    expect(auth?.userId).toBe('u1');
    expect(auth?.scopes).toEqual(['assets:read']);
    expect(auth?.livemode).toBe(false);
  });

  it('rejects a key with the wrong prefix', async () => {
    expect(await service.authenticate('sk_live_whatever')).toBeNull();
  });

  it('rejects a revoked key', async () => {
    const created = await service.create('u1', 'k', ['assets:read'], true);
    const stored = [...fake.byHash.values()][0];
    stored.revokedAt = new Date();
    expect(await service.authenticate(created.key)).toBeNull();
  });

  it('rejects an expired key', async () => {
    const created = await service.create('u1', 'k', ['assets:read'], true);
    const stored = [...fake.byHash.values()][0];
    stored.expiresAt = new Date(Date.now() - 1000);
    expect(await service.authenticate(created.key)).toBeNull();
  });
});
