import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SYSTEM_CONTEXT } from '../../apps/api/src/infrastructure/database/prisma.service';
import { RecoveryCodeService } from '../../apps/api/src/modules/auth/recovery-code.service';
import { TotpService } from '../../apps/api/src/modules/auth/totp.service';

/**
 * MFA recovery codes — executable proof against a real PostgreSQL.
 *
 * Proves the at-rest posture (hashes only) and the user-scoped row-level
 * security: one account can never read or consume another account's codes,
 * even with the application role, because the database refuses.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const ALICE = `77777777-7777-4700-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const MALLORY = `88888888-8888-4800-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

d('MFA recovery codes (real PostgreSQL, real RLS)', () => {
  let prisma: PrismaService;
  let recovery: RecoveryCodeService;
  let codes: string[];

  beforeAll(async () => {
    asSuper(`INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
             VALUES ('${ALICE}', 'alice-${RUN}@fu-test.edu', 'x', 'Alice', now(), now()),
                    ('${MALLORY}', 'mallory-${RUN}@fu-test.edu', 'x', 'Mallory', now(), now())`);

    prisma = new PrismaService();
    recovery = new RecoveryCodeService(
      // Minimal config stand-in: the service reads one key at construction.
      { get: () => 'integration-test-encryption-key-000000' } as never,
      prisma,
      new TotpService(),
    );
    codes = await recovery.generateAndStore(ALICE);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(`DELETE FROM mfa_recovery_code WHERE user_id IN ('${ALICE}', '${MALLORY}')`);
    asSuper(`DELETE FROM user_account WHERE id IN ('${ALICE}', '${MALLORY}')`);
  });

  it('stores eight hashes, never a plaintext code', async () => {
    expect(codes).toHaveLength(8);
    const rows = asSuper(
      `SELECT count(*), bool_and(code_hash ~ '^[a-f0-9]{64}$') FROM mfa_recovery_code WHERE user_id = '${ALICE}'`,
    );
    expect(rows).toBe('8|t');
    for (const code of codes) {
      const leak = asSuper(
        `SELECT count(*) FROM mfa_recovery_code WHERE user_id = '${ALICE}' AND code_hash LIKE '%${code.replace(/-/g, '')}%'`,
      );
      expect(leak).toBe('0');
    }
  });

  it('a correct code verifies and is consumed exactly once', async () => {
    await expect(recovery.verifyAndConsume(ALICE, codes[0])).resolves.toBe(true);
    await expect(recovery.verifyAndConsume(ALICE, codes[0])).resolves.toBe(false);

    const consumed = asSuper(
      `SELECT count(*) FROM mfa_recovery_code WHERE user_id = '${ALICE}' AND used_at IS NOT NULL`,
    );
    expect(consumed).toBe('1');
  });

  it('another account cannot spend Alice’s codes — row-level security refuses', async () => {
    // Mallory presents Alice's unconsumed code. The lookup runs under
    // Mallory's context, so RLS hides Alice's rows entirely.
    await expect(recovery.verifyAndConsume(MALLORY, codes[1])).resolves.toBe(false);
    const stillUnused = asSuper(
      `SELECT count(*) FROM mfa_recovery_code WHERE user_id = '${ALICE}' AND used_at IS NULL`,
    );
    expect(Number(stillUnused)).toBe(7);
  });

  it('system context (no user) sees zero recovery rows', async () => {
    const visible = await prisma.withTenant(SYSTEM_CONTEXT, (tx) =>
      tx.mfaRecoveryCode.findMany({ where: { userId: ALICE } }),
    );
    expect(visible).toHaveLength(0);
  });

  it('re-enrolment revokes the previous unconsumed set', async () => {
    const fresh = await recovery.generateAndStore(ALICE);
    expect(fresh).toHaveLength(8);
    // A code from the revoked set no longer verifies.
    await expect(recovery.verifyAndConsume(ALICE, codes[2])).resolves.toBe(false);
    // A code from the fresh set does.
    await expect(recovery.verifyAndConsume(ALICE, fresh[0])).resolves.toBe(true);
  });
});
