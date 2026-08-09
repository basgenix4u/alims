import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import type { Env } from '../../config/env';
import { TokenService } from './token.service';

const ENV: Partial<Env> = {
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret-that-is-long-enough-00',
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_SECONDS: 60 * 60 * 24 * 30,
  STEP_UP_TTL_SECONDS: 300,
  JWT_ISSUER: 'alims.api',
  JWT_AUDIENCE: 'alims.web',
};

function makeService(overrides: Partial<Env> = {}): TokenService {
  const values = { ...ENV, ...overrides } as Record<string, unknown>;
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new TokenService(config);
}

describe('TokenService — access tokens', () => {
  it('signs and verifies a token, preserving subject and session', async () => {
    const service = makeService();
    const token = await service.signToken({
      subject: 'user-1',
      purpose: 'access',
      ttlSeconds: 900,
      sessionId: 'family-1',
    });

    const claims = await service.verifyToken(token, 'access');
    expect(claims.sub).toBe('user-1');
    expect(claims.sid).toBe('family-1');
    expect(claims.purpose).toBe('access');
  });

  it('rejects a token whose purpose does not match', async () => {
    const service = makeService();
    // The limited token issued mid-MFA must never work as a full access token.
    const challenge = await service.signToken({
      subject: 'user-1',
      purpose: 'mfa_challenge',
      ttlSeconds: 300,
    });

    await expect(service.verifyToken(challenge, 'access')).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const mint = makeService();
    const verify = makeService({ JWT_ACCESS_SECRET: 'a-totally-different-secret-value-0000000' });
    const token = await mint.signToken({ subject: 'user-1', purpose: 'access', ttlSeconds: 900 });

    await expect(verify.verifyToken(token, 'access')).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const service = makeService();
    // Negative TTL puts exp in the past; clockTolerance is only 5s.
    const token = await service.signToken({
      subject: 'user-1',
      purpose: 'access',
      ttlSeconds: -60,
    });

    await expect(service.verifyToken(token, 'access')).rejects.toThrow();
  });

  it('rejects the alg:none algorithm-confusion attack', async () => {
    const service = makeService();
    // An unsigned token must never be accepted, even with valid claims.
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    )}.${Buffer.from(
      JSON.stringify({ sub: 'attacker', purpose: 'access', iss: 'alims.api', aud: 'alims.web' }),
    ).toString('base64url')}.`;

    await expect(service.verifyToken(unsigned, 'access')).rejects.toThrow();
  });

  it('rejects a token minted for a different issuer', async () => {
    const service = makeService();
    const foreign = await new SignJWT({ purpose: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-1')
      .setIssuer('evil.example')
      .setAudience('alims.web')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(ENV.JWT_ACCESS_SECRET));

    await expect(service.verifyToken(foreign, 'access')).rejects.toThrow();
  });

  it('rejects a token minted for a different audience', async () => {
    const service = makeService();
    const foreign = await new SignJWT({ purpose: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user-1')
      .setIssuer('alims.api')
      .setAudience('some.other.app')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(ENV.JWT_ACCESS_SECRET));

    await expect(service.verifyToken(foreign, 'access')).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const service = makeService();
    const token = await service.signToken({
      subject: 'user-1',
      purpose: 'access',
      ttlSeconds: 900,
    });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', purpose: 'access', iss: 'alims.api', aud: 'alims.web' }),
    ).toString('base64url');

    await expect(
      service.verifyToken(`${header}.${forged}.${signature}`, 'access'),
    ).rejects.toThrow();
  });
});

describe('TokenService — refresh tokens', () => {
  it('issues a high-entropy token and stores only its hash', () => {
    const service = makeService();
    const issued = service.issueRefreshToken();

    // 32 random bytes, base64url encoded.
    expect(issued.token.length).toBeGreaterThanOrEqual(43);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.tokenHash).not.toContain(issued.token);
  });

  it('issues a UUID family id, matching the uuid column type', () => {
    const service = makeService();
    const issued = service.issueRefreshToken();
    expect(issued.familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('keeps the family id when rotating within a lineage', () => {
    const service = makeService();
    const first = service.issueRefreshToken();
    const rotated = service.issueRefreshToken(first.familyId);

    expect(rotated.familyId).toBe(first.familyId);
    expect(rotated.token).not.toBe(first.token);
  });

  it('never repeats a token value', () => {
    const service = makeService();
    const seen = new Set(Array.from({ length: 200 }, () => service.issueRefreshToken().token));
    expect(seen.size).toBe(200);
  });

  it('hashes deterministically so lookup by hash works', () => {
    const service = makeService();
    const issued = service.issueRefreshToken();
    expect(service.hashRefreshToken(issued.token)).toBe(issued.tokenHash);
  });

  it('produces different hashes under different keys', () => {
    const a = makeService();
    const b = makeService({ REFRESH_TOKEN_SECRET: 'entirely-different-refresh-key-0000000000' });
    const issued = a.issueRefreshToken();
    expect(b.hashRefreshToken(issued.token)).not.toBe(issued.tokenHash);
  });

  it('sets the expiry from the configured TTL', () => {
    const service = makeService({ REFRESH_TOKEN_TTL_SECONDS: 3600 });
    const issued = service.issueRefreshToken();
    const deltaMs = issued.expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(3_590_000);
    expect(deltaMs).toBeLessThanOrEqual(3_600_000);
  });
});

describe('TokenService — constant-time comparison', () => {
  it('matches identical strings and rejects differing ones', () => {
    const service = makeService();
    expect(service.safeEquals('abc123', 'abc123')).toBe(true);
    expect(service.safeEquals('abc123', 'abc124')).toBe(false);
    expect(service.safeEquals('short', 'a-much-longer-value')).toBe(false);
    expect(service.safeEquals('', '')).toBe(true);
  });
});
