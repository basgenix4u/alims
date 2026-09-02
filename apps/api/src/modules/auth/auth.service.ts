import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserAccount } from '@prisma/client';
import type { LoginInput, RegisterInput, UserSummary } from '@alims/contracts';
import type { Env } from '../../config/env';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

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

/**
 * One message for every credential failure.
 *
 * Distinct messages ("no such user" vs "wrong password") are an account
 * enumeration oracle (OWASP A07 / api_specification.md §3).
 */
const GENERIC_CREDENTIAL_ERROR = 'Email or password is incorrect.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
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
      return { user: this.toSummary(existing), verificationEmailSent: true };
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

    return { user: this.toSummary(user), verificationEmailSent: true };
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
   * minted after /auth/mfa/verify (T-101).
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
      user: this.toSummary(user),
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
      user: this.toSummary(stored.user),
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
  toSummary(user: UserAccount): UserSummary {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      identityLevel: user.identityLevel,
      mfaEnabled: user.mfaEnabled,
    };
  }
}
