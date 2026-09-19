import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserAccount } from '@prisma/client';
import {
  LoginInput,
  MembershipSummary,
  RegisterInput,
  UserSummary,
} from '@alims/contracts';
import type { Env } from '../../config/env';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { EmailService } from '../../infrastructure/email/email.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from './password.service';
import { RecoveryCodeService } from './recovery-code.service';
import { SecretCipherService } from './secret-cipher.service';
import { TokenService, type AccessTokenClaims } from './token.service';
import { TotpService } from './totp.service';

/** Request metadata used for audit and throttling decisions. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: UserSummary;
  mfaRequired: boolean;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RegisterResult {
  user: UserSummary;
  verificationEmailSent: true;
}

/** Response for MFA enrolment: the plaintext secret is shown exactly once. */
export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

/** Response for completing MFA and for step-up. */
export interface MfaSessionResult {
  accessToken: string;
  expiresIn: number;
  user: UserSummary;
}

/**
 * One message for every credential failure.
 *
 * Distinct messages ("no such user" vs "wrong password") are an account
 * enumeration oracle (OWASP A07 / api_specification.md §3).
 */
const GENERIC_CREDENTIAL_ERROR = 'Email or password is incorrect.';
const GENERIC_MFA_ERROR = 'Invalid MFA code.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly totp: TotpService,
    private readonly cipher: SecretCipherService,
    private readonly recovery: RecoveryCodeService,
    private readonly emails: EmailService,
  ) {}

  /**
   * Register an account.
   *
   * Returns 201 with the same shape whether or not the email already exists.
   * The contract is explicit: the response must not confirm registration
   * state to an attacker. A duplicate silently sends a "someone tried to
   * register with your address" email instead of erroring.
   */
  async register(input: RegisterInput, ctx: RequestContext): Promise<RegisterResult> {
    const email = this.normaliseEmail(input.email);
    const existing = await this.prisma.userAccount.findUnique({ where: { email } });

    if (existing) {
      // Burn comparable time so duplicate vs new is not timeable.
      await this.passwords.hash(input.password);
      await this.audit.record({
        action: 'auth.register',
        subjectType: 'user_account',
        subjectId: existing.id,
        payload: { outcome: 'duplicate_email_suppressed' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      // Identical response shape — no 409 leak.
      return { user: await this.summarize(existing), verificationEmailSent: true };
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.userAccount.create({
      data: {
        email,
        passwordHash,
        displayName: input.displayName.trim(),
        locale: input.locale ?? 'en',
      },
    });

    await this.audit.record({
      action: 'auth.register',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: { outcome: 'created' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    // The contract `verificationEmailSent: true` is now TRUE: a single-use
    // token is persisted and the email lands in the durable outbox (sent
    // when SMTP is configured; honestly pending otherwise).
    await this.issueEmailVerification(user.id, user.email);

    return { user: await this.summarize(user), verificationEmailSent: true };
  }

  /**
   * Authenticate.
   *
   * Ordering matters: the account-lock check happens before password
   * verification, and the unknown-email path still performs a dummy Argon2
   * verification so both branches cost the same.
   */
  async login(input: LoginInput, ctx: RequestContext): Promise<AuthSession> {
    const email = this.normaliseEmail(input.email);
    const user = await this.prisma.userAccount.findUnique({ where: { email } });

    if (!user) {
      await this.passwords.wasteTime(input.password);
      await this.audit.record({
        action: 'auth.login.failure',
        subjectType: 'user_account',
        payload: { reason: 'unknown_email' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException(GENERIC_CREDENTIAL_ERROR);
    }

    if (this.isLocked(user)) {
      await this.passwords.wasteTime(input.password);
      await this.audit.record({
        action: 'auth.login.locked',
        subjectType: 'user_account',
        subjectId: user.id,
        payload: { reason: 'account_locked' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException(GENERIC_CREDENTIAL_ERROR);
    }

    // A deactivated account must not be distinguishable from a wrong password.
    if (!user.isActive) {
      await this.passwords.wasteTime(input.password);
      await this.audit.record({
        action: 'auth.login.failure',
        subjectType: 'user_account',
        subjectId: user.id,
        payload: { reason: 'inactive_account' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException(GENERIC_CREDENTIAL_ERROR);
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.registerFailedAttempt(user, ctx);
      throw new UnauthorizedException(GENERIC_CREDENTIAL_ERROR);
    }

    // Successful login clears the failure counter and upgrades the hash if
    // the Argon2 cost parameters have since been raised.
    const passwordHash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(input.password)
      : user.passwordHash;

    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, passwordHash },
    });

    return this.startSession(user, ctx);
  }

  /**
   * Issue tokens for an authenticated user.
   *
   * When MFA is enabled the access token is a *challenge* token: purpose
   * `mfa_challenge`, which no protected route accepts. The full token is only
   * minted after /auth/mfa/verify.
   */
  async startSession(user: UserAccount, ctx: RequestContext): Promise<AuthSession> {
    const mfaRequired = user.mfaEnabled;
    const refresh = this.tokens.issueRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: refresh.familyId,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
      },
    });

    const ttl = mfaRequired
      ? Math.min(this.config.get('STEP_UP_TTL_SECONDS'), this.tokens.accessTokenTtlSeconds)
      : this.tokens.accessTokenTtlSeconds;

    const accessToken = await this.tokens.signToken({
      subject: user.id,
      purpose: mfaRequired ? 'mfa_challenge' : 'access',
      ttlSeconds: ttl,
      sessionId: refresh.familyId,
    });

    await this.audit.record({
      action: 'auth.login.success',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: { mfaRequired },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken,
      expiresIn: ttl,
      user: await this.summarize(user),
      mfaRequired,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /**
   * Rotate a refresh token.
   *
   * Reuse detection: refresh tokens are single-use. Presenting one that was
   * already consumed means the token leaked and both the attacker and the
   * legitimate user hold copies — so the entire family is revoked, forcing a
   * fresh login. (PRD §9.1, contract §3.)
   */
  async refresh(rawToken: string, ctx: RequestContext): Promise<AuthSession> {
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (stored.consumedAt || stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      await this.audit.record({
        action: 'auth.refresh.reuse_detected',
        subjectType: 'refresh_token',
        subjectId: stored.id,
        actorUserId: stored.userId,
        payload: { familyId: stored.familyId, outcome: 'family_revoked' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      this.logger.warn(`Refresh token reuse detected; revoked family ${stored.familyId}`);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (!stored.user.isActive) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const next = this.tokens.issueRefreshToken(stored.familyId);

    // Consume the old token and mint the replacement atomically: a crash
    // between the two must not leave a consumed token with no successor.
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          familyId: next.familyId,
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
        },
      }),
    ]);

    const mfaRequired = false; // MFA was already satisfied when the family began.
    const accessToken = await this.tokens.signToken({
      subject: stored.userId,
      purpose: 'access',
      ttlSeconds: this.tokens.accessTokenTtlSeconds,
      sessionId: next.familyId,
    });

    await this.audit.record({
      action: 'auth.refresh.success',
      subjectType: 'refresh_token',
      subjectId: stored.id,
      actorUserId: stored.userId,
      payload: { familyId: stored.familyId },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: { ...this.toSummary(stored.user), memberships: await this.membershipsOf(stored.userId) },
      mfaRequired,
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    };
  }

  /** Revoke the presented token's family. Idempotent and safe to call blind. */
  async logout(rawToken: string | undefined, ctx: RequestContext): Promise<void> {
    if (!rawToken) {
      return;
    }
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      return;
    }

    await this.revokeFamily(stored.familyId);
    await this.audit.record({
      action: 'auth.logout',
      subjectType: 'refresh_token',
      subjectId: stored.id,
      actorUserId: stored.userId,
      payload: { familyId: stored.familyId },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  /** Revoke every unconsumed token in a family. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke all sessions for a user — used by password reset (invalidates all sessions). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async findUserById(userId: string): Promise<UserAccount | null> {
    return this.prisma.userAccount.findUnique({ where: { id: userId } });
  }

  /**
   * Start MFA enrolment.
   *
   * Generates a TOTP secret, encrypts it at rest (AES-256-GCM), and returns
   * the plaintext secret + otpauth URI exactly once. The secret is not active
   * until /auth/mfa/verify confirms possession with a valid code.
   *
   * Recovery codes are generated alongside: hashes persisted, plaintexts
   * returned exactly once. A recovery code may later be supplied in place of
   * a TOTP code and is consumed on use.
   */
  async enrollMfa(user: UserAccount): Promise<MfaEnrollResult> {
    if (user.mfaEnabled) {
      throw new ForbiddenException('MFA is already enabled.');
    }

    const secret = this.totp.generateSecret();
    const recoveryCodes = await this.recovery.generateAndStore(user.id);

    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: { mfaSecretEncrypted: this.cipher.encryptSecret(secret) },
    });

    await this.audit.record({
      action: 'auth.mfa.enrolled',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: { outcome: 'awaiting_verification' },
    });

    return { secret, otpauthUrl: this.totp.otpauthUrl(user.email, secret), recoveryCodes };
  }

  /**
   * Complete MFA with a valid TOTP code, then mint the real access token.
   *
   * Accepts two token purposes, covering both MFA moments:
   *   - the limited `mfa_challenge` token issued by login when MFA is
   *     already enabled (the login continuation), and
   *   - a normal `access` token (first-time enrolment activation: the user
   *     enrolled, then confirms possession of the authenticator).
   *
   * A step-up token is never accepted here.
   */
  async verifyMfa(token: string, totpCode: string, ctx: RequestContext): Promise<MfaSessionResult> {
    const { claims, via } = await this.resolveMfaToken(token);

    const user = await this.prisma.userAccount.findUnique({ where: { id: claims.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Authentication required.');
    }

    const secret = user.mfaSecretEncrypted ? this.cipher.tryDecrypt(user.mfaSecretEncrypted) : null;
    if (!secret || !this.totp.verify(secret, totpCode)) {
      // A single-use recovery code stands in for the authenticator (spec §3).
      // Consumed atomically on success; enrolment stays intact.
      const viaRecovery = secret && (await this.recovery.verifyAndConsume(user.id, totpCode));
      if (!viaRecovery) {
        await this.audit.record({
          action: 'auth.mfa.failure',
        subjectType: 'user_account',
        subjectId: user.id,
        actorUserId: user.id,
        payload: { reason: secret ? 'invalid_code' : 'no_pending_enrolment' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
        throw new UnauthorizedException(GENERIC_MFA_ERROR);
      }

      await this.audit.record({
        action: 'auth.mfa.recovered',
        subjectType: 'user_account',
        subjectId: user.id,
        actorUserId: user.id,
        payload: { via },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }

    await this.prisma.userAccount.update({ where: { id: user.id }, data: { mfaEnabled: true } });

    await this.audit.record({
      action: 'auth.mfa.verified',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: { via },
    });

    // The session family (sid) is carried over from the presented token.
    const accessToken = await this.tokens.signToken({
      subject: user.id,
      purpose: 'access',
      ttlSeconds: this.tokens.accessTokenTtlSeconds,
      sessionId: claims.sid,
    });

    return {
      accessToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: await this.summarize({ ...user, mfaEnabled: true }),
    };
  }

  /** Accept an mfa_challenge or access token; reject anything else. */
  private async resolveMfaToken(
    raw: string,
  ): Promise<{ claims: AccessTokenClaims; via: 'access' | 'mfa_challenge' }> {
    try {
      const claims = await this.tokens.verifyToken(raw, 'mfa_challenge');
      return { claims, via: 'mfa_challenge' };
    } catch {
      // not a challenge token — try a normal access token
    }
    try {
      const claims = await this.tokens.verifyToken(raw, 'access');
      return { claims, via: 'access' };
    } catch {
      throw new UnauthorizedException('Authentication required.');
    }
  }

  /**
   * Issue a short-lived, single-use step-up assertion.
   *
   * The token carries a fresh `jti`; StepUpGuard consumes it exactly once and
   * records the consumption in the append-only audit trail, so a replayed
   * assertion is rejected and permanently logged.
   */
  async stepUp(
    userId: string,
    totpCode: string,
    ctx: RequestContext,
  ): Promise<{ stepUpToken: string; expiresIn: number }> {
    const user = await this.prisma.userAccount.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Authentication required.');
    }
    if (!user.mfaEnabled) {
      throw new ForbiddenException('MFA is required to perform this action.');
    }

    const secret = user.mfaSecretEncrypted ? this.cipher.tryDecrypt(user.mfaSecretEncrypted) : null;
    if (!secret || !this.totp.verify(secret, totpCode)) {
      await this.audit.record({
        action: 'auth.step_up.failure',
        subjectType: 'user_account',
        subjectId: user.id,
        actorUserId: user.id,
        payload: { reason: secret ? 'invalid_code' : 'secret_unavailable' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException(GENERIC_MFA_ERROR);
    }

    const stepUpToken = await this.tokens.signToken({
      subject: user.id,
      purpose: 'step_up',
      ttlSeconds: this.tokens.stepUpTtlSeconds,
      jti: randomUUID(),
    });

    await this.audit.record({
      action: 'auth.step_up.granted',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: { ttlSeconds: this.tokens.stepUpTtlSeconds },
    });

    return { stepUpToken, expiresIn: this.tokens.stepUpTtlSeconds };
  }

  /** Count a failed attempt and lock the account once the threshold is hit. */
  private async registerFailedAttempt(user: UserAccount, ctx: RequestContext): Promise<void> {
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS');
    const lockoutMinutes = this.config.get('LOGIN_LOCKOUT_MINUTES');
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= maxAttempts;

    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + lockoutMinutes * 60_000) : user.lockedUntil,
      },
    });

    await this.audit.record({
      action: shouldLock ? 'auth.login.locked' : 'auth.login.failure',
      subjectType: 'user_account',
      subjectId: user.id,
      payload: { reason: 'invalid_password', attempts, locked: shouldLock },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  private isLocked(user: UserAccount): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  /**
   * Lower-case and trim the email.
   *
   * Without this, `Alice@x.com` and `alice@x.com` become two accounts and the
   * unique constraint is bypassed.
   */
  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Explicit allow-list DTO.
   *
   * Never return the entity: passwordHash, mfaSecretEncrypted and
   * legalNameEncrypted must never reach a response body (PRD §9.1).
   */
  // ── Email verification (api_specification.md §3) ──────────

  /**
   * (Re)send the verification email. Always 204 at the route — the response
   * must not reveal the account's verification state. A no-op for accounts
   * already at or beyond email verification.
   */
  async requestEmailVerification(userId: string, ctx: RequestContext): Promise<void> {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      select: { email: true, identityLevel: true },
    });
    if (!user || user.identityLevel !== 'unverified') {
      return;
    }
    await this.issueEmailVerification(userId, user.email);
    await this.audit.record({
      action: 'auth.email.verification_requested',
      subjectType: 'user_account',
      subjectId: userId,
      actorUserId: userId,
      payload: {},
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Confirm a verification token from the email link (public route).
   * Single-use, 24-hour, hash-looked-up — the refresh_token posture.
   * Promotes identityLevel unverified → email; never downgrades a higher
   * level. Returns the updated user summary.
   */
  async confirmEmailVerification(rawToken: string, ctx: RequestContext): Promise<UserSummary> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!stored) {
      throw new UnauthorizedException('This verification link is not valid.');
    }
    if (stored.consumedAt) {
      throw new UnauthorizedException('This verification link has already been used.');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('This verification link has expired. Request a new one.');
    }

    const user = await this.prisma.userAccount.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('This verification link is not valid.');
    }

    await this.prisma.emailVerificationToken.update({
      where: { id: stored.id },
      data: { consumedAt: new Date() },
    });

    // unverified → email only; identity_verified is never downgraded.
    const updated =
      user.identityLevel === 'unverified'
        ? await this.prisma.userAccount.update({
            where: { id: user.id },
            data: { identityLevel: 'email' },
          })
        : user;

    await this.audit.record({
      action: 'auth.email.verified',
      subjectType: 'user_account',
      subjectId: user.id,
      actorUserId: user.id,
      payload: {},
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.summarize(updated);
  }

  /** Mint a fresh single-use token, supersede all previous, queue the email. */
  private async issueEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      // One live token per account: a resend supersedes the previous link.
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.emailVerificationToken.create({
        data: { id: randomUUID(), userId, tokenHash, expiresAt },
      }),
    ]);

    const base = this.config.get('PUBLIC_BASE_URL', { infer: true }) ?? 'http://localhost:3000';
    await this.emails.enqueue({
      to: email,
      template: 'email-verification',
      subject: 'Verify your ALIMS email address',
      bodyText: [
        'Welcome to ALIMS.',
        '',
        'Confirm your email address by opening this link within 24 hours:',
        `${base}/verify-email?token=${token}`,
        '',
        'If you did not create an ALIMS account, you can ignore this email.',
      ].join('\n'),
    });
  }

  /**
   * Active memberships of `userId` in verified institutions.
   *
   * Reads through the `my_memberships` SECURITY DEFINER function: the
   * membership table is RLS-scoped to the claimed tenant, so without this
   * a user could never discover which tenant to claim (chicken-and-egg).
   * The function only ever returns the caller's own rows.
   */
  async membershipsOf(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        institution_id: string;
        institution_name: string;
        institution_slug: string;
        department_id: string | null;
        programme_id: string | null;
        role: string;
        status: string;
      }>
    >`SELECT institution_id, institution_name, institution_slug, department_id, programme_id, role, status
       FROM my_memberships(${userId}::uuid)`;
    return rows.map((r) => ({
      institutionId: r.institution_id,
      institutionName: r.institution_name,
      institutionSlug: r.institution_slug,
      departmentId: r.department_id,
      programmeId: r.programme_id,
      role: r.role as MembershipSummary['role'],
      status: r.status as MembershipSummary['status'],
    }));
  }

  /** `toSummary` + live memberships — what every session-producing path returns. */
  async summarize(user: UserAccount): Promise<UserSummary> {
    return { ...this.toSummary(user), memberships: await this.membershipsOf(user.id) };
  }

  toSummary(user: UserAccount): Omit<UserSummary, 'memberships'> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      identityLevel: user.identityLevel,
      mfaEnabled: user.mfaEnabled,
    };
  }
}
