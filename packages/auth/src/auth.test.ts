import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { generateApiKey, hashApiKey } from './api-keys.js';
import { generateRefreshToken, hashToken, signAccessToken, verifyAccessToken } from './tokens.js';

const tokenConfig = {
  accessSecret: 'a-very-long-access-secret-value',
  refreshSecret: 'a-very-long-refresh-secret-value',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 1209600,
};

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('api keys', () => {
  it('generates a prefixed key and stores only the hash', () => {
    const key = generateApiKey({ livemode: true, livePrefix: 'vyr_live_', testPrefix: 'vyr_test_' });
    expect(key.plaintext.startsWith('vyr_live_')).toBe(true);
    expect(key.hash).toBe(hashApiKey(key.plaintext));
    expect(key.hash).not.toContain(key.plaintext);
    expect(key.last4.length).toBe(4);
  });
});

describe('tokens', () => {
  it('signs and verifies an access token', async () => {
    const jwt = await signAccessToken({ sub: 'user-1', role: 'USER', sid: 's1' }, tokenConfig);
    const claims = await verifyAccessToken(jwt, tokenConfig);
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('USER');
  });

  it('hashes refresh tokens deterministically and never stores raw', () => {
    const { raw, hash } = generateRefreshToken();
    expect(hash).toBe(hashToken(raw));
    expect(hash).not.toBe(raw);
  });
});
