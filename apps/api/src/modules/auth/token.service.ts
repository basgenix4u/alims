import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../../config/env';

/** Distinguishes token purposes so one can never be replayed as another. */
export type TokenPurpose = 'access' | 'mfa_challenge' | 'step_up';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  purpose: TokenPurpose;
  /** Session family, so a token can be tied back to its refresh lineage. */
  sid?: string;
  /** Present only on step-up tokens: the action the assertion authorises. */
  act?: string;
  /** Single-use id for step-up replay prevention. */
  jti?: string;
}

export interface IssuedRefreshToken {
  /** Raw value handed to the client in the cookie. Never persisted. */
  token: string;
  /** HMAC of the raw value. This is what the database stores. */
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshSecret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.accessKey = new TextEncoder().encode(this.config.get('JWT_ACCESS_SECRET'));
    this.refreshSecret = this.config.get('REFRESH_TOKEN_SECRET');
    this.issuer = this.config.get('JWT_ISSUER');
    this.audience = this.config.get('JWT_AUDIENCE');
  }

  get accessTokenTtlSeconds(): number {
    return this.config.get('ACCESS_TOKEN_TTL_SECONDS');
  }

  get stepUpTtlSeconds(): number {
    return this.config.get('STEP_UP_TTL_SECONDS');
  }

  get refreshTokenTtlSeconds(): number {
    return this.config.get('REFRESH_TOKEN_TTL_SECONDS');
  }

  /**
   * Mint a signed JWT.
   *
   * `purpose` is asserted on verification. Without it, the limited token
   * issued mid-MFA could be presented as a full access token and bypass the
   * second factor entirely.
   */
  async signToken(params: {
    subject: string;
    purpose: TokenPurpose;
    ttlSeconds: number;
    sessionId?: string;
    action?: string;
    jti?: string;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    let jwt = new SignJWT({
      purpose: params.purpose,
      ...(params.sessionId ? { sid: params.sessionId } : {}),
      ...(params.action ? { act: params.action } : {}),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(params.subject)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + params.ttlSeconds);

    if (params.jti) {
      jwt = jwt.setJti(params.jti);
    }

    return jwt.sign(this.accessKey);
  }

  /**
   * Verify a JWT and assert its purpose.
   *
   * Algorithm is pinned to HS256: accepting the header's `alg` unchecked is
   * the classic `alg: none` / RS256→HS256 confusion attack.
   */
  async verifyToken(token: string, expectedPurpose: TokenPurpose): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.accessKey, {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.audience,
      clockTolerance: 5,
    });

    if (payload.purpose !== expectedPurpose) {
      throw new Error('token purpose mismatch');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('token subject missing');
    }

    return payload as AccessTokenClaims;
  }

  /**
   * Create a refresh token.
   *
   * 32 bytes from the CSPRNG — not a JWT, because refresh tokens must be
   * revocable server-side. Only the HMAC is stored, so a database disclosure
   * does not yield usable session tokens.
   */
  issueRefreshToken(familyId?: string): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlSeconds * 1000);
    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      // UUID: refresh_token.family_id is a uuid column.
      familyId: familyId ?? randomUUID(),
      expiresAt,
    };
  }

  /** Keyed HMAC — a stolen database alone cannot forge lookups without the key. */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  /** Constant-time comparison for any secret-to-secret check. */
  safeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
