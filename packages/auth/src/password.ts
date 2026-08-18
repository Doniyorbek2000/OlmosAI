import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Promise wrapper that preserves the options overload of crypto.scrypt. */
function scrypt(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

const KEYLEN = 64;
const COST = 2 ** 15; // N
const BLOCK = 8; // r
const PARALLEL = 1; // p

/**
 * Password hashing with scrypt (a memory-hard KDF in Node's stdlib — no native
 * build step). Format: scrypt$N$r$p$salt$hash (all base64url).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N: COST,
    r: BLOCK,
    p: PARALLEL,
    maxmem: 128 * COST * BLOCK * 2,
  })) as Buffer;
  return [
    'scrypt',
    COST,
    BLOCK,
    PARALLEL,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
    maxmem: 128 * Number(nStr) * Number(rStr) * 2,
  })) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
