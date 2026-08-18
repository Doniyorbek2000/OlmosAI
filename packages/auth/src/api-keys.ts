import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedApiKey {
  /** Full secret shown to the user exactly once. */
  plaintext: string;
  prefix: string;
  last4: string;
  hash: string;
  livemode: boolean;
}

/**
 * API keys are `${prefix}${random}`. We store only the SHA-256 hash + a display
 * prefix and last4 (spec §31). The plaintext is returned once at creation.
 */
export function generateApiKey(opts: {
  livemode: boolean;
  livePrefix: string;
  testPrefix: string;
}): GeneratedApiKey {
  const prefix = opts.livemode ? opts.livePrefix : opts.testPrefix;
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `${prefix}${secret}`;
  return {
    plaintext,
    prefix,
    last4: secret.slice(-4),
    hash: hashApiKey(plaintext),
    livemode: opts.livemode,
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
