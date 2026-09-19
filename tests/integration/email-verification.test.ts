import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service';
import { EmailService } from '../../apps/api/src/infrastructure/email/email.service';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service';
import { PasswordService } from '../../apps/api/src/modules/auth/password.service';
import { RecoveryCodeService } from '../../apps/api/src/modules/auth/recovery-code.service';
import { SecretCipherService } from '../../apps/api/src/modules/auth/secret-cipher.service';
import { TokenService } from '../../apps/api/src/modules/auth/token.service';
import { TotpService } from '../../apps/api/src/modules/auth/totp.service';
import { ConfigService } from '@nestjs/config';

/**
 * Email verification against a real PostgreSQL (api_specification.md §3):
 *
 *   - registration mints a single-use 24-hour token (stored hashed) and
 *     queues the email in the durable outbox;
 *   - with no SMTP configured the outbox row HONESTLY stays `pending` —
 *     the scanner's `unsupported` pattern, never a claimed send;
 *   - confirming promotes identityLevel unverified → email, consumes the
 *     token, audits, and rejects reuse / tampering / expiry;
 *   - a resend supersedes the previous link;
 *   - the outbox body contains the verification URL (what a transport
 *     would deliver), and only the hash is persisted for the token.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const EMAIL = `verify-${RUN}@vu.edu`;
const EMAIL2 = `resend-${RUN}@vu.edu`;
let registeredUserId = '';
let resendUserId = '';

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
    }).trim();
  }
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

d('Email verification (real PostgreSQL, honest outbox)', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let emails: EmailService;

  const CTX = { ip: '127.0.0.1', userAgent: 'vitest' };

  beforeAll(async () => {
    const CFG: Record<string, string> = {
      JWT_ACCESS_SECRET: 'integration-access-secret-00000000000',
      REFRESH_TOKEN_SECRET: 'integration-refresh-secret-0000000000',
      MFA_ENCRYPTION_KEY: 'integration-mfa-key-0000000000000000',
      AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
      PLATFORM_ADMIN_USER_IDS: '',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      // SMTP_URL deliberately unset: the honest 'pending' path.
    };
    const config = {
      get: (key: string) => CFG[key],
    } as unknown as ConfigService<never, true>;

    prisma = new PrismaService();
    emails = new EmailService(prisma);
    auth = new AuthService(
      prisma,
      new PasswordService(),
      new TokenService(config),
      new AuditService(prisma, config),
      config,
      new TotpService(),
      new SecretCipherService(config),
      new RecoveryCodeService(config, prisma, new TotpService()),
      emails,
    );
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(
      `DELETE FROM email_verification_token WHERE user_id IN ('${registeredUserId}', '${resendUserId}')`,
    );
    asSuper(`DELETE FROM email_outbox WHERE to_email IN ('${EMAIL}', '${EMAIL2}')`);
    asSuper(
      `DELETE FROM user_account WHERE id IN ('${registeredUserId}', '${resendUserId}')`,
    );
  });

  /** The raw token, recovered exactly as the email link would carry it. */
  async function tokenFromOutbox(email: string): Promise<string> {
    const row = await prisma.emailOutbox.findFirstOrThrow({
      where: { toEmail: email, template: 'email-verification' },
      orderBy: { createdAt: 'desc' },
    });
    const match = /token=([A-Za-z0-9_-]+)/.exec(row.bodyText);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  it('registration mints a hashed token and an honest pending outbox row', async () => {
    const result = await auth.register(
      { email: EMAIL, password: 'a-very-strong-password-1', displayName: 'Verifier' },
      CTX,
    );
    expect(result.verificationEmailSent).toBe(true);
    expect(result.user.identityLevel).toBe('unverified');

    registeredUserId = result.user.id;
    const token = await tokenFromOutbox(EMAIL);
    expect(token.length).toBeGreaterThanOrEqual(40);

    // Only the hash is stored; the row is live for 24h.
    const hash = createHash('sha256').update(token).digest('hex');
    const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe(result.user.id);
    expect(stored!.consumedAt).toBeNull();
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

    // No SMTP configured: the outbox row is pending, never 'sent'.
    const outbox = await prisma.emailOutbox.findFirstOrThrow({
      where: { toEmail: EMAIL, template: 'email-verification' },
    });
    expect(outbox.status).toBe('pending');
    expect(outbox.sentAt).toBeNull();
    expect(emails.configured).toBe(false);
  });

  it('confirm promotes to email, consumes the token, audits', async () => {
    const token = await tokenFromOutbox(EMAIL);
    const confirmed = await auth.confirmEmailVerification(token, CTX);
    expect(confirmed.identityLevel).toBe('email');
    expect(confirmed.email).toBe(EMAIL);

    const hash = createHash('sha256').update(token).digest('hex');
    const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    expect(stored!.consumedAt).not.toBeNull();

    const audited = await prisma.auditEvent.count({
      where: { action: 'auth.email.verified', subjectId: confirmed.id },
    });
    expect(audited).toBe(1);
  });

  it('the consumed token is dead (401) and tampering is 401', async () => {
    const token = await tokenFromOutbox(EMAIL);
    await expect(auth.confirmEmailVerification(token, CTX)).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.confirmEmailVerification('an-attacker-forged-token-aaaaaaaaaaaa', CTX),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('a resend supersedes the previous link (exactly one live token)', async () => {
    // A SECOND, still-unverified account (the first is already confirmed).
    const second = await auth.register(
      { email: EMAIL2, password: 'a-very-strong-password-1', displayName: 'Resender' },
      CTX,
    );
    resendUserId = second.user.id;
    const original = await tokenFromOutbox(EMAIL2);

    await auth.requestEmailVerification(resendUserId, CTX);
    const fresh = await tokenFromOutbox(EMAIL2);
    expect(fresh).not.toBe(original);

    const live = await prisma.emailVerificationToken.findMany({
      where: { userId: resendUserId },
    });
    expect(live).toHaveLength(1);

    // The superseded link is dead; the fresh one works.
    await expect(auth.confirmEmailVerification(original, CTX)).rejects.toMatchObject({ status: 401 });
    const confirmed = await auth.confirmEmailVerification(fresh, CTX);
    expect(confirmed.identityLevel).toBe('email');

    const requested = await prisma.auditEvent.count({
      where: { action: 'auth.email.verification_requested', subjectId: resendUserId },
    });
    expect(requested).toBe(1);
  });

  it('request after verification is a no-op — no new email, no new token', async () => {
    const before = await prisma.emailOutbox.count({ where: { toEmail: EMAIL } });
    await auth.requestEmailVerification(registeredUserId, CTX);
    const after = await prisma.emailOutbox.count({ where: { toEmail: EMAIL } });
    expect(after).toBe(before); // nothing queued for a verified account
  });
});
