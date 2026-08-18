import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  sub: string; // userId
  role: string;
  sid?: string; // session id
}

export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  issuer?: string;
}

/** Signs short-lived access JWTs. */
export async function signAccessToken(
  claims: AccessTokenClaims,
  config: TokenConfig,
): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(config.issuer ?? 'veyra')
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(new TextEncoder().encode(config.accessSecret));
}

export async function verifyAccessToken(
  token: string,
  config: TokenConfig,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(config.accessSecret), {
    issuer: config.issuer ?? 'veyra',
  });
  return { sub: String(payload.sub), role: String(payload.role), sid: payload.sid as string };
}

/**
 * Opaque refresh token. We return the raw token to the client (secure cookie)
 * and store only its SHA-256 hash — raw refresh tokens are never persisted
 * (spec §17).
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
