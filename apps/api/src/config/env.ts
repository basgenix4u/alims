import { z } from 'zod';

/**
 * Environment validation. The API refuses to boot on invalid configuration
 * rather than failing later in an unclear way (PRD §9.1).
 */
/**
 * Secrets must be long enough to resist offline brute force. 32 chars is the
 * floor; production values should be 64 random bytes, base64-encoded.
 */
const MIN_SECRET_LENGTH = 32;

const secretSchema = z
  .string()
  .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`);

/**
 * Placeholder values that ship in .env.example. Allowed in development and
 * test so the stack starts out of the box; rejected in production so a
 * deployment can never run on a publicly known key.
 */
const INSECURE_PLACEHOLDERS = new Set([
  'change-me',
  'changeme',
  'secret',
  'development-only-change-me-in-production',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_AUTHENTICATED: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_ANONYMOUS: z.coerce.number().int().positive().default(20),

  // ── Database ──────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // ── Tokens (PRD §9.1, api_specification.md §1) ────────────
  /** Signs short-lived access tokens (HS256). */
  JWT_ACCESS_SECRET: secretSchema,
  /** Hashes refresh tokens at rest so a DB read cannot replay a session. */
  REFRESH_TOKEN_SECRET: secretSchema,
  /** Encrypts TOTP secrets at rest (AES-256-GCM). Consumed by T-101. */
  MFA_ENCRYPTION_KEY: secretSchema,
  /** Access token TTL. Contract fixes this at 900s. */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Refresh token TTL — 30 days. */
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  /** Step-up assertion TTL. Contract fixes this at 300s. */
  STEP_UP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Token issuer/audience claims — checked on verify to stop token confusion. */
  JWT_ISSUER: z.string().default('alims.api'),
  JWT_AUDIENCE: z.string().default('alims.web'),

  // ── Login throttling (PRD §9.1 resource abuse) ────────────
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  // ── Cookies ───────────────────────────────────────────────
  /** Omit unless the web app is on a different subdomain. */
  COOKIE_DOMAIN: z.string().optional(),
  /**
   * Secure flag on the refresh cookie. Defaults on; may be disabled only for
   * local HTTP development. Forced on in production below.
   */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Salts IP/user-agent hashes in the audit log so raw PII is never stored. */
  AUDIT_HASH_SALT: secretSchema,
});

export type Env = z.infer<typeof envSchema>;

/** Secrets that must never hold a placeholder value in production. */
const PRODUCTION_CRITICAL_SECRETS = [
  'JWT_ACCESS_SECRET',
  'REFRESH_TOKEN_SECRET',
  'MFA_ENCRYPTION_KEY',
  'AUDIT_HASH_SALT',
] as const satisfies readonly (keyof Env)[];

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  // Fail closed in production rather than booting on a known-public key.
  if (env.NODE_ENV === 'production') {
    const violations: string[] = [];

    for (const key of PRODUCTION_CRITICAL_SECRETS) {
      const value = String(env[key]);
      if (INSECURE_PLACEHOLDERS.has(value.toLowerCase()) || value.includes('change-me')) {
        violations.push(`  - ${key}: still set to a placeholder value`);
      }
    }

    // Distinct secrets: reusing one key across purposes lets a token minted
    // for one context be replayed in another.
    const secrets = PRODUCTION_CRITICAL_SECRETS.map((k) => String(env[k]));
    if (new Set(secrets).size !== secrets.length) {
      violations.push('  - token secrets must all differ from one another');
    }

    if (!env.COOKIE_SECURE) {
      violations.push('  - COOKIE_SECURE must be true in production');
    }

    if (corsOrigins(env).some((o) => o.startsWith('http://'))) {
      violations.push('  - CORS_ALLOWED_ORIGINS must not contain plaintext http:// origins');
    }

    if (violations.length > 0) {
      throw new Error(`Insecure production configuration:\n${violations.join('\n')}`);
    }
  }

  return env;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
