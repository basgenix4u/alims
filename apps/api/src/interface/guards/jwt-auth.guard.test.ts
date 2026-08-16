import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { TokenService } from '../../modules/auth/token.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const ENV: Partial<Env> = {
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret-that-is-long-enough-00',
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  STEP_UP_TTL_SECONDS: 300,
  JWT_ISSUER: 'alims.api',
  JWT_AUDIENCE: 'alims.web',
};

const tokens = new TokenService({
  get: (key: string) => (ENV as Record<string, unknown>)[key],
} as unknown as ConfigService<Env, true>);

function contextFor(headers: Record<string, string>): {
  ctx: ExecutionContext;
  request: AuthenticatedRequest;
} {
  const request = { headers } as unknown as AuthenticatedRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { ctx, request };
}

function guardFor(isPublic: boolean): JwtAuthGuard {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  return new JwtAuthGuard(tokens, reflector);
}

describe('JwtAuthGuard — deny by default', () => {
  it('allows a route explicitly marked @Public()', async () => {
    const { ctx } = contextFor({});
    await expect(guardFor(true).canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { ctx } = contextFor({});
    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-bearer scheme', async () => {
    const { ctx } = contextFor({ authorization: 'Basic dXNlcjpwYXNz' });
    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed token', async () => {
    const { ctx } = contextFor({ authorization: 'Bearer not.a.jwt' });
    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid access token and attaches the principal', async () => {
    const token = await tokens.signToken({
      subject: 'user-42',
      purpose: 'access',
      ttlSeconds: 900,
      sessionId: 'family-9',
    });
    const { ctx, request } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guardFor(false).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-42', sessionId: 'family-9' });
  });

  it('rejects an MFA challenge token on a protected route', async () => {
    // The core MFA bypass: a half-authenticated token must not pass.
    const challenge = await tokens.signToken({
      subject: 'user-42',
      purpose: 'mfa_challenge',
      ttlSeconds: 300,
    });
    const { ctx } = contextFor({ authorization: `Bearer ${challenge}` });

    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a step-up token used as an access token', async () => {
    const stepUp = await tokens.signToken({
      subject: 'user-42',
      purpose: 'step_up',
      ttlSeconds: 300,
      action: 'certificate.issue',
    });
    const { ctx } = contextFor({ authorization: `Bearer ${stepUp}` });

    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await tokens.signToken({
      subject: 'user-42',
      purpose: 'access',
      ttlSeconds: -120,
    });
    const { ctx } = contextFor({ authorization: `Bearer ${expired}` });

    await expect(guardFor(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('gives the same message for every failure mode (no oracle)', async () => {
    const cases = ['Bearer not.a.jwt', 'Basic abc', ''];
    const messages = await Promise.all(
      cases.map((authorization) =>
        guardFor(false)
          .canActivate(contextFor(authorization ? { authorization } : {}).ctx)
          .then(() => 'allowed')
          .catch((e: Error) => e.message),
      ),
    );

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('Authentication required.');
  });
});
