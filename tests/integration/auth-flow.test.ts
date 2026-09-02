import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Authentication flow — executable proof over real HTTP against a real
 * PostgreSQL, not mocks (T-100, PRD §9.1, api_specification.md §3).
 *
 * Complements tests/integration/security.test.ts, which proves the database
 * guarantees. This file proves the API surface honours the contract.
 *
 * Requires: migrations applied and the API running on API_BASE_URL.
 * Skipped automatically when INTEGRATION_API is not set, so unit CI stays fast.
 */

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
const ENABLED = Boolean(process.env.INTEGRATION_API);
const d = ENABLED ? describe : describe.skip;

/** Unique per run so repeated runs never collide on the unique email index. */
const RUN = Date.now();
const email = (tag: string): string => `t100-${tag}-${RUN}@university.test`;
const STRONG_PASSWORD = 'a-very-strong-password-1';

/**
 * Auth mutations share one source IP and may each wait out a 60s throttle
 * window, so tests that mutate need far more than the default 30s budget.
 */
const MUTATION_TIMEOUT = 180_000;

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function callOnce(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.cookie) {
    headers.Cookie = init.cookie;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body, cookies: res.headers.getSetCookie() };
}

/**
 * Auth mutations are capped at 5/min per IP (PRD §9.1). The whole suite
 * shares one source IP, so a 429 here means the limiter is doing its job —
 * we wait out the window rather than weakening the production setting.
 * Rate-limiting itself is asserted explicitly in its own test below.
 */
async function call(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<HttpResult> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await callOnce(path, init);
    if (result.status !== 429) {
      return result;
    }
    await sleep(61_000);
  }
  return callOnce(path, init);
}

/** Extract the refresh cookie in `name=value` form for the next request. */
function refreshCookie(cookies: string[]): string {
  const raw = cookies.find((c) => c.startsWith('alims_rt='));
  if (!raw) {
    throw new Error('alims_rt cookie was not set');
  }
  return raw.split(';')[0] as string;
}

function asSuper(sql: string): string {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

/** Throttle budget is 5/min per IP on auth mutations; reset between groups. */
function clearLockout(userEmail: string): void {
  asSuper(
    `UPDATE user_account SET failed_login_attempts=0, locked_until=NULL WHERE email='${userEmail}'`,
  );
}

d('T-100 · Registration', () => {
  it(
    'creates an account and returns only allow-listed fields',
    async () => {
      const res = await call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email('reg'),
          password: STRONG_PASSWORD,
          displayName: 'Registration Test',
        }),
      });

      expect(res.status).toBe(201);
      const user = res.body.user as Record<string, unknown>;
      expect(Object.keys(user).sort()).toEqual(
        ['displayName', 'email', 'id', 'identityLevel', 'mfaEnabled'].sort(),
      );
      // The hash must never cross the wire.
      expect(JSON.stringify(res.body)).not.toContain('argon2');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'stores an Argon2id hash rather than the password',
    async () => {
      const addr = email('hash');
      await call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: STRONG_PASSWORD, displayName: 'Hash Test' }),
      });

      const stored = asSuper(`SELECT password_hash FROM user_account WHERE email='${addr}'`);
      expect(stored).toMatch(/^\$argon2id\$/);
      expect(stored).toContain('m=19456,t=2,p=1');
      expect(stored).not.toContain(STRONG_PASSWORD);
    },
    MUTATION_TIMEOUT,
  );

  it(
    'rejects a password below the 12-character policy',
    async () => {
      const res = await call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: email('weak'), password: 'short', displayName: 'Weak' }),
      });

      expect(res.status).toBe(400);
      expect(res.body.title).toBeTruthy();
    },
    MUTATION_TIMEOUT,
  );

  it('does not disclose that an email is already registered', async () => {
    const addr = email('dup');
    const body = JSON.stringify({
      email: addr,
      password: STRONG_PASSWORD,
      displayName: 'Duplicate',
    });

    const first = await call('/auth/register', { method: 'POST', body });
    const second = await call('/auth/register', { method: 'POST', body });

    // Identical status and shape — no 409 to enumerate against.
    expect(second.status).toBe(first.status);
    expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(asSuper(`SELECT count(*) FROM user_account WHERE email='${addr}'`)).toBe('1');
  }, 180_000); // Two mutations that may each wait out a 60s throttle window.
});

d('T-100 · Login', () => {
  const addr = email('login');

  beforeAll(async () => {
    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: STRONG_PASSWORD, displayName: 'Login Test' }),
    });
  }, MUTATION_TIMEOUT);

  it(
    'returns an access token with the contracted 900s TTL',
    async () => {
      clearLockout(addr);
      const res = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
      });

      expect(res.status).toBe(200);
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.mfaRequired).toBe(false);
      expect(typeof res.body.accessToken).toBe('string');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'sets a hardened httpOnly refresh cookie',
    async () => {
      clearLockout(addr);
      const res = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
      });

      const cookie = res.cookies.find((c) => c.startsWith('alims_rt='));
      expect(cookie).toBeTruthy();
      // XSS cannot read it; CSRF cannot send it cross-site; scoped to /auth.
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/api/v1/auth');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'persists only the hash of the refresh token',
    async () => {
      clearLockout(addr);
      const res = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
      });
      const raw = refreshCookie(res.cookies).split('=')[1] as string;

      const hit = asSuper(`SELECT count(*) FROM refresh_token WHERE token_hash='${raw}'`);
      expect(hit).toBe('0');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'gives an identical response for unknown email and wrong password',
    async () => {
      clearLockout(addr);
      const unknown = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email('ghost'), password: 'wrong-password-value' }),
      });
      const wrong = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: 'wrong-password-value' }),
      });

      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body.detail).toBe(wrong.body.detail);
      expect(unknown.body.detail).toBe('Email or password is incorrect.');
      clearLockout(addr);
    },
    MUTATION_TIMEOUT,
  );
});

d('T-100 · Refresh rotation and reuse detection', () => {
  const addr = email('rotate');
  let initialCookie: string;

  beforeAll(async () => {
    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: STRONG_PASSWORD, displayName: 'Rotate Test' }),
    });
    clearLockout(addr);
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
    });
    initialCookie = refreshCookie(login.cookies);
  }, MUTATION_TIMEOUT);

  it(
    'rotates the cookie and issues a fresh access token',
    async () => {
      const res = await call('/auth/refresh', { method: 'POST', cookie: initialCookie });

      expect(res.status).toBe(200);
      const rotated = refreshCookie(res.cookies);
      expect(rotated).not.toBe(initialCookie);
      expect(res.body.expiresIn).toBe(900);
    },
    MUTATION_TIMEOUT,
  );

  it(
    'revokes the entire family when a consumed token is replayed',
    async () => {
      // initialCookie was consumed by the previous test — replay it.
      const replay = await call('/auth/refresh', { method: 'POST', cookie: initialCookie });
      expect(replay.status).toBe(401);

      const family = asSuper(
        `SELECT count(*) FROM refresh_token rt
         JOIN user_account u ON u.id = rt.user_id
        WHERE u.email='${addr}' AND rt.revoked_at IS NULL`,
      );
      // Every token in the lineage is dead, including the honest one.
      expect(family).toBe('0');
    },
    MUTATION_TIMEOUT,
  );

  it('records the reuse as a tamper-evident audit event', () => {
    const found = asSuper(
      `SELECT count(*) FROM audit_event WHERE action='auth.refresh.reuse_detected'`,
    );
    expect(Number(found)).toBeGreaterThan(0);
  });

  it(
    'rejects an unknown refresh cookie',
    async () => {
      const res = await call('/auth/refresh', {
        method: 'POST',
        cookie: 'alims_rt=not-a-real-token-value',
      });
      expect(res.status).toBe(401);
    },
    MUTATION_TIMEOUT,
  );
});

d('T-100 · Protected routes (deny by default)', () => {
  const addr = email('guard');
  let accessToken: string;

  beforeAll(async () => {
    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: STRONG_PASSWORD, displayName: 'Guard Test' }),
    });
    clearLockout(addr);
    const login = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
    });
    accessToken = login.body.accessToken as string;
  }, MUTATION_TIMEOUT);

  it(
    'rejects /auth/me without a token',
    async () => {
      const res = await call('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.detail).toBe('Authentication required.');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'rejects a forged token',
    async () => {
      const res = await call('/auth/me', {
        headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdHRhY2tlciJ9.' },
      });
      expect(res.status).toBe(401);
    },
    MUTATION_TIMEOUT,
  );

  it(
    'accepts a valid token and returns the profile',
    async () => {
      const res = await call('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(addr);
      expect(res.body).not.toHaveProperty('passwordHash');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'returns RFC 9457 Problem Details with a correlation id',
    async () => {
      const res = await call('/auth/me');
      expect(res.body).toMatchObject({
        type: expect.stringContaining('alims.org/errors/'),
        status: 401,
        instance: '/api/v1/auth/me',
      });
      expect(typeof res.body.requestId).toBe('string');
    },
    MUTATION_TIMEOUT,
  );

  it(
    'never leaks internals in an error body',
    async () => {
      const res = await call('/auth/me');
      const serialised = JSON.stringify(res.body).toLowerCase();
      for (const leak of ['argon2', 'prisma', 'postgres', 'stack', '/home/', 'select ']) {
        expect(serialised).not.toContain(leak);
      }
    },
    MUTATION_TIMEOUT,
  );
});

d('T-100 · Logout', () => {
  it(
    'revokes the session and clears the cookie',
    async () => {
      const addr = email('logout');
      await call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: addr,
          password: STRONG_PASSWORD,
          displayName: 'Logout Test',
        }),
      });
      clearLockout(addr);
      const login = await call('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: addr, password: STRONG_PASSWORD }),
      });
      const cookie = refreshCookie(login.cookies);

      const out = await call('/auth/logout', { method: 'POST', cookie });
      expect(out.status).toBe(204);

      // The revoked cookie can no longer be exchanged.
      const after = await call('/auth/refresh', { method: 'POST', cookie });
      expect(after.status).toBe(401);
    },
    MUTATION_TIMEOUT,
  );
});

d('T-100 · Rate limiting (PRD §9.1 resource abuse)', () => {
  it(
    'throttles auth mutations at 5 requests per minute per IP',
    async () => {
      // Deliberately exceed the budget with no back-off: the 6th must be shed.
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        const res = await callOnce('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email(`rl-${i}`), password: 'wrong-password-value' }),
        });
        statuses.push(res.status);
      }

      expect(statuses).toContain(429);
      // Brute force is stopped well before the 7th guess.
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
      await sleep(61_000);
    },
    MUTATION_TIMEOUT,
  );
});

d('T-100 · Audit chain integrity', () => {
  afterAll(() => {
    // Leave the chain verifiable for the next run.
    expect(asSuper('SELECT count(*) FROM verify_audit_chain()')).toBe('0');
  }, MUTATION_TIMEOUT);

  it('links every event to its predecessor', () => {
    const orphans = asSuper(
      `SELECT count(*) FROM audit_event WHERE prev_hash IS NULL AND seq > (SELECT min(seq) FROM audit_event)`,
    );
    expect(orphans).toBe('0');
  });

  it('hashes IP addresses instead of storing them', () => {
    const raw = asSuper(
      `SELECT count(*) FROM audit_event WHERE ip_hash IS NOT NULL AND ip_hash !~ '^[a-f0-9]{64}$'`,
    );
    expect(raw).toBe('0');
  });

  it('keeps credentials out of audit payloads', () => {
    const leaked = asSuper(
      `SELECT count(*) FROM audit_event WHERE payload::text ILIKE '%${STRONG_PASSWORD}%'`,
    );
    expect(leaked).toBe('0');
  });

  it('reports an intact chain', () => {
    expect(asSuper('SELECT count(*) FROM verify_audit_chain()')).toBe('0');
  });
});
