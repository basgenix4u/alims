import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserAccount } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import { AuditService } from '../../infrastructure/audit/audit.service';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthService, type RequestContext } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const ENV: Partial<Env> = {
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret-that-is-long-enough-00',
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  STEP_UP_TTL_SECONDS: 300,
  JWT_ISSUER: 'alims.api',
  JWT_AUDIENCE: 'alims.web',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MINUTES: 15,
};

const CTX: RequestContext = { ip: '203.0.113.10', userAgent: 'vitest' };

interface RefreshRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
  user?: UserAccount;
}

/** Minimal in-memory stand-in for the tables AuthService touches. */
class FakeDb {
  users = new Map<string, UserAccount>();
  refreshTokens = new Map<string, RefreshRow>();
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }
}

function baseUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: 'user-1',
    email: 'researcher@university.edu',
    passwordHash: '',
    displayName: 'Ada Researcher',
    legalNameEncrypted: null,
    identityLevel: 'unverified',
    mfaSecretEncrypted: null,
    mfaEnabled: false,
    locale: 'en',
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserAccount;
}

function makeHarness(): {
  service: AuthService;
  db: FakeDb;
  audit: { record: ReturnType<typeof vi.fn> };
  passwords: PasswordService;
  tokens: TokenService;
} {
  const db = new FakeDb();

  const prisma = {
    userAccount: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return [...db.users.values()].find((u) => u.email === where.email) ?? null;
        }
        return db.users.get(where.id ?? '') ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Partial<UserAccount> }) => {
        const user = baseUser({ ...data, id: db.nextId('user') });
        db.users.set(user.id, user);
        return user;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<UserAccount> }) => {
          const existing = db.users.get(where.id);
          if (!existing) throw new Error('not found');
          const updated = { ...existing, ...data } as UserAccount;
          db.users.set(where.id, updated);
          return updated;
        },
      ),
    },
    refreshToken: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = [...db.refreshTokens.values()].find((r) => r.tokenHash === where.tokenHash);
        if (!row) return null;
        return { ...row, user: db.users.get(row.userId) };
      }),
      create: vi.fn(async ({ data }: { data: Omit<RefreshRow, 'id'> }) => {
        const row: RefreshRow = {
          id: db.nextId('rt'),
          consumedAt: null,
          revokedAt: null,
          ...data,
        };
        db.refreshTokens.set(row.id, row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<RefreshRow> }) => {
          const row = db.refreshTokens.get(where.id);
          if (!row) throw new Error('not found');
          const updated = { ...row, ...data };
          db.refreshTokens.set(where.id, updated);
          return updated;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { familyId?: string; userId?: string; revokedAt: null };
          data: Partial<RefreshRow>;
        }) => {
          let count = 0;
          for (const [id, row] of db.refreshTokens) {
            const familyMatch = where.familyId ? row.familyId === where.familyId : true;
            const userMatch = where.userId ? row.userId === where.userId : true;
            if (familyMatch && userMatch && row.revokedAt === null) {
              db.refreshTokens.set(id, { ...row, ...data });
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
    // Prisma's array form of $transaction: the promises are already running.
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => (ENV as Record<string, unknown>)[key],
  } as unknown as ConfigService<Env, true>;

  const audit = { record: vi.fn(async () => undefined) };
  const passwords = new PasswordService();
  const tokens = new TokenService(config);
  const service = new AuthService(
    prisma,
    passwords,
    tokens,
    audit as unknown as AuditService,
    config,
  );

  return { service, db, audit, passwords, tokens };
}

describe('AuthService — registration', () => {
  it('stores an Argon2id hash, never the plaintext password', async () => {
    const { service, db } = makeHarness();

    await service.register(
      {
        email: 'new@university.edu',
        password: 'a-very-strong-password-1',
        displayName: 'New User',
      },
      CTX,
    );

    const stored = [...db.users.values()][0];
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain('a-very-strong-password-1');
  });

  it('normalises the email so casing cannot create duplicates', async () => {
    const { service, db } = makeHarness();

    await service.register(
      {
        email: '  MiXeD@University.EDU  ',
        password: 'a-very-strong-password-1',
        displayName: 'User',
      },
      CTX,
    );

    expect([...db.users.values()][0]?.email).toBe('mixed@university.edu');
  });

  it('does not reveal that an email is already registered', async () => {
    const { service, db } = makeHarness();
    const existing = baseUser({ id: 'user-existing', email: 'taken@university.edu' });
    db.users.set(existing.id, existing);

    const result = await service.register(
      {
        email: 'taken@university.edu',
        password: 'another-strong-password-2',
        displayName: 'Impostor',
      },
      CTX,
    );

    // Same shape as a fresh registration — no 409, no distinguishing field.
    expect(result.verificationEmailSent).toBe(true);
    expect(result.user.id).toBe('user-existing');
    // And no second account was created.
    expect(db.users.size).toBe(1);
  });

  it('never returns the password hash in the response', async () => {
    const { service } = makeHarness();

    const result = await service.register(
      { email: 'safe@university.edu', password: 'a-very-strong-password-1', displayName: 'Safe' },
      CTX,
    );

    expect(JSON.stringify(result)).not.toContain('argon2');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(Object.keys(result.user).sort()).toEqual(
      ['displayName', 'email', 'id', 'identityLevel', 'mfaEnabled'].sort(),
    );
  });
});

describe('AuthService — login', () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(async () => {
    harness = makeHarness();
    const passwordHash = await harness.passwords.hash('correct-password-value-1');
    harness.db.users.set('user-1', baseUser({ passwordHash }));
  });

  it('issues an access token and a refresh token on valid credentials', async () => {
    const session = await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    expect(session.accessToken).toBeTruthy();
    expect(session.expiresIn).toBe(900);
    expect(session.mfaRequired).toBe(false);
    expect(session.refreshToken).toBeTruthy();

    const claims = await harness.tokens.verifyToken(session.accessToken, 'access');
    expect(claims.sub).toBe('user-1');
  });

  it('persists only the hash of the refresh token', async () => {
    const session = await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    const stored = [...harness.db.refreshTokens.values()][0];
    expect(stored?.tokenHash).not.toBe(session.refreshToken);
    expect(stored?.tokenHash).toBe(harness.tokens.hashRefreshToken(session.refreshToken));
  });

  it('rejects a wrong password with the generic message', async () => {
    await expect(
      harness.service.login(
        { email: 'researcher@university.edu', password: 'wrong-password-value-1' },
        CTX,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the identical error for an unknown email (no enumeration)', async () => {
    const unknown = await harness.service
      .login({ email: 'nobody@university.edu', password: 'whatever-password-1' }, CTX)
      .catch((e: Error) => e.message);

    const wrongPassword = await harness.service
      .login({ email: 'researcher@university.edu', password: 'wrong-password-value-1' }, CTX)
      .catch((e: Error) => e.message);

    expect(unknown).toBe(wrongPassword);
    expect(unknown).toBe('Email or password is incorrect.');
  });

  it('counts failed attempts', async () => {
    await harness.service
      .login({ email: 'researcher@university.edu', password: 'wrong-1' }, CTX)
      .catch(() => undefined);

    expect(harness.db.users.get('user-1')?.failedLoginAttempts).toBe(1);
  });

  it('locks the account at the configured threshold', async () => {
    for (let i = 0; i < 5; i += 1) {
      await harness.service
        .login({ email: 'researcher@university.edu', password: 'wrong-attempt' }, CTX)
        .catch(() => undefined);
    }

    const user = harness.db.users.get('user-1');
    expect(user?.failedLoginAttempts).toBe(5);
    expect(user?.lockedUntil).toBeInstanceOf(Date);
    expect(user?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses the correct password while the account is locked', async () => {
    harness.db.users.set(
      'user-1',
      baseUser({
        passwordHash: harness.db.users.get('user-1')!.passwordHash,
        lockedUntil: new Date(Date.now() + 10 * 60_000),
        failedLoginAttempts: 5,
      }),
    );

    await expect(
      harness.service.login(
        { email: 'researcher@university.edu', password: 'correct-password-value-1' },
        CTX,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('clears the failure counter after a successful login', async () => {
    harness.db.users.set(
      'user-1',
      baseUser({
        passwordHash: harness.db.users.get('user-1')!.passwordHash,
        failedLoginAttempts: 3,
      }),
    );

    await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    expect(harness.db.users.get('user-1')?.failedLoginAttempts).toBe(0);
    expect(harness.db.users.get('user-1')?.lockedUntil).toBeNull();
  });

  it('refuses a deactivated account without revealing why', async () => {
    harness.db.users.set(
      'user-1',
      baseUser({ passwordHash: harness.db.users.get('user-1')!.passwordHash, isActive: false }),
    );

    await expect(
      harness.service.login(
        { email: 'researcher@university.edu', password: 'correct-password-value-1' },
        CTX,
      ),
    ).rejects.toThrow('Email or password is incorrect.');
  });

  it('issues only a limited challenge token when MFA is enabled', async () => {
    harness.db.users.set(
      'user-1',
      baseUser({ passwordHash: harness.db.users.get('user-1')!.passwordHash, mfaEnabled: true }),
    );

    const session = await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    expect(session.mfaRequired).toBe(true);
    // The token must NOT be usable as a full access token.
    await expect(harness.tokens.verifyToken(session.accessToken, 'access')).rejects.toThrow();
    await expect(
      harness.tokens.verifyToken(session.accessToken, 'mfa_challenge'),
    ).resolves.toBeTruthy();
  });

  it('writes an audit event for success and for failure', async () => {
    await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );
    await harness.service
      .login({ email: 'researcher@university.edu', password: 'wrong' }, CTX)
      .catch(() => undefined);

    const actions = harness.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.login.success');
    expect(actions).toContain('auth.login.failure');
  });
});

describe('AuthService — refresh rotation and reuse detection (PRD §9.1)', () => {
  let harness: ReturnType<typeof makeHarness>;
  let firstToken: string;

  beforeEach(async () => {
    harness = makeHarness();
    const passwordHash = await harness.passwords.hash('correct-password-value-1');
    harness.db.users.set('user-1', baseUser({ passwordHash }));
    const session = await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );
    firstToken = session.refreshToken;
  });

  it('rotates to a new token and consumes the old one', async () => {
    const rotated = await harness.service.refresh(firstToken, CTX);

    expect(rotated.refreshToken).not.toBe(firstToken);
    const oldRow = [...harness.db.refreshTokens.values()].find(
      (r) => r.tokenHash === harness.tokens.hashRefreshToken(firstToken),
    );
    expect(oldRow?.consumedAt).toBeInstanceOf(Date);
  });

  it('keeps the rotated token inside the same family', async () => {
    const rotated = await harness.service.refresh(firstToken, CTX);
    const families = new Set([...harness.db.refreshTokens.values()].map((r) => r.familyId));
    expect(families.size).toBe(1);
    expect(rotated.accessToken).toBeTruthy();
  });

  it('revokes the whole family when a consumed token is replayed', async () => {
    await harness.service.refresh(firstToken, CTX);

    // The attacker replays the stolen, already-consumed token.
    await expect(harness.service.refresh(firstToken, CTX)).rejects.toThrow(UnauthorizedException);

    // Every token in the lineage is now revoked — including the legitimate one.
    const rows = [...harness.db.refreshTokens.values()];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('audits the reuse as a security event', async () => {
    await harness.service.refresh(firstToken, CTX);
    await harness.service.refresh(firstToken, CTX).catch(() => undefined);

    const actions = harness.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('auth.refresh.reuse_detected');
  });

  it('locks out the legitimate user after a family revocation', async () => {
    const rotated = await harness.service.refresh(firstToken, CTX);
    await harness.service.refresh(firstToken, CTX).catch(() => undefined);

    // The honest token is dead too — correct: we cannot tell the two apart.
    await expect(harness.service.refresh(rotated.refreshToken, CTX)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown refresh token', async () => {
    await expect(harness.service.refresh('not-a-real-token', CTX)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired refresh token', async () => {
    const row = [...harness.db.refreshTokens.values()][0]!;
    harness.db.refreshTokens.set(row.id, { ...row, expiresAt: new Date(Date.now() - 1000) });

    await expect(harness.service.refresh(firstToken, CTX)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects refresh for a deactivated account', async () => {
    harness.db.users.set(
      'user-1',
      baseUser({ ...harness.db.users.get('user-1')!, isActive: false }),
    );

    await expect(harness.service.refresh(firstToken, CTX)).rejects.toThrow(UnauthorizedException);
  });

  it('issues a full access token on refresh, never a challenge token', async () => {
    const rotated = await harness.service.refresh(firstToken, CTX);
    const claims = await harness.tokens.verifyToken(rotated.accessToken, 'access');
    expect(claims.purpose).toBe('access');
  });
});

describe('AuthService — logout and session revocation', () => {
  it('revokes the family on logout', async () => {
    const harness = makeHarness();
    const passwordHash = await harness.passwords.hash('correct-password-value-1');
    harness.db.users.set('user-1', baseUser({ passwordHash }));
    const session = await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    await harness.service.logout(session.refreshToken, CTX);

    expect([...harness.db.refreshTokens.values()].every((r) => r.revokedAt !== null)).toBe(true);
    await expect(harness.service.refresh(session.refreshToken, CTX)).rejects.toThrow();
  });

  it('is a no-op when no cookie is presented', async () => {
    const harness = makeHarness();
    await expect(harness.service.logout(undefined, CTX)).resolves.toBeUndefined();
  });

  it('does not throw on an unknown token', async () => {
    const harness = makeHarness();
    await expect(harness.service.logout('unknown-token', CTX)).resolves.toBeUndefined();
  });

  it('revokeAllSessions kills every session for the user', async () => {
    const harness = makeHarness();
    const passwordHash = await harness.passwords.hash('correct-password-value-1');
    harness.db.users.set('user-1', baseUser({ passwordHash }));

    await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );
    await harness.service.login(
      { email: 'researcher@university.edu', password: 'correct-password-value-1' },
      CTX,
    );

    await harness.service.revokeAllSessions('user-1');

    expect([...harness.db.refreshTokens.values()].every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe('AuthService — response shaping', () => {
  it('toSummary exposes only the allow-listed fields', () => {
    const harness = makeHarness();
    const summary = harness.service.toSummary(
      baseUser({
        passwordHash: '$argon2id$secret',
        mfaSecretEncrypted: 'encrypted-totp-secret',
        legalNameEncrypted: 'encrypted-legal-name',
      }),
    );

    expect(Object.keys(summary).sort()).toEqual(
      ['displayName', 'email', 'id', 'identityLevel', 'mfaEnabled'].sort(),
    );
    const serialised = JSON.stringify(summary);
    expect(serialised).not.toContain('argon2');
    expect(serialised).not.toContain('encrypted-totp-secret');
    expect(serialised).not.toContain('encrypted-legal-name');
  });
});
