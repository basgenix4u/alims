import { describe, expect, it } from 'vitest';
import { corsOrigins, validateEnv } from './env';

/**
 * Configuration is a security control (PRD §9.1). These tests assert the API
 * fails closed: it must refuse to boot on a weak or publicly known secret
 * rather than start and quietly issue forgeable tokens.
 */

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/alims',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  REFRESH_TOKEN_SECRET: 'b'.repeat(40),
  MFA_ENCRYPTION_KEY: 'c'.repeat(40),
  AUDIT_HASH_SALT: 'd'.repeat(40),
};

const PROD = { ...BASE, NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://alims.org' };

describe('validateEnv — required configuration', () => {
  it('accepts a complete development configuration', () => {
    const env = validateEnv({ ...BASE, NODE_ENV: 'development' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
  });

  it('applies the contracted token TTL defaults', () => {
    const env = validateEnv({ ...BASE });
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.STEP_UP_TTL_SECONDS).toBe(300);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = BASE;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('rejects a secret shorter than 32 characters', () => {
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects each required secret when absent', () => {
    for (const key of [
      'JWT_ACCESS_SECRET',
      'REFRESH_TOKEN_SECRET',
      'MFA_ENCRYPTION_KEY',
      'AUDIT_HASH_SALT',
    ]) {
      const incomplete: Record<string, unknown> = { ...BASE };
      delete incomplete[key];
      expect(() => validateEnv(incomplete), `${key} should be required`).toThrow();
    }
  });
});

describe('validateEnv — production hardening (fail closed)', () => {
  it('accepts a correctly hardened production configuration', () => {
    const env = validateEnv(PROD);
    expect(env.NODE_ENV).toBe('production');
    expect(env.COOKIE_SECURE).toBe(true);
  });

  it('refuses to boot on a placeholder secret', () => {
    expect(() => validateEnv({ ...PROD, JWT_ACCESS_SECRET: 'change-me-'.repeat(4) })).toThrow(
      /placeholder/,
    );
  });

  it('refuses to boot when two secrets are identical', () => {
    // Reuse would let a token minted for one purpose be replayed for another.
    expect(() => validateEnv({ ...PROD, REFRESH_TOKEN_SECRET: BASE.JWT_ACCESS_SECRET })).toThrow(
      /must all differ/,
    );
  });

  it('refuses to boot with an insecure refresh cookie', () => {
    expect(() => validateEnv({ ...PROD, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('refuses to boot with a plaintext http CORS origin', () => {
    expect(() => validateEnv({ ...PROD, CORS_ALLOWED_ORIGINS: 'http://alims.org' })).toThrow(
      /http:\/\//,
    );
  });

  it('tolerates development placeholders outside production', () => {
    // Local developers must not be blocked by production-only rules.
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'development', COOKIE_SECURE: 'false' }),
    ).not.toThrow();
  });
});

describe('corsOrigins', () => {
  it('splits, trims and drops empty entries', () => {
    const env = validateEnv({
      ...BASE,
      CORS_ALLOWED_ORIGINS: 'https://a.org, https://b.org ,, https://c.org',
    });
    expect(corsOrigins(env)).toEqual(['https://a.org', 'https://b.org', 'https://c.org']);
  });
});
