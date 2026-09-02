import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { StepUpAction } from '@alims/contracts';
import type { Env } from '../../config/env';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { TokenService } from '../../modules/auth/token.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { StepUpGuard } from './step-up.guard';

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

const USER = '11111111-1111-1111-1111-111111111111';

function fakeRequest(options: {
  user?: { userId: string; sessionId: string | null };
  stepUpToken?: string;
}): AuthenticatedRequest {
  return {
    user: options.user,
    headers: options.stepUpToken ? { 'x-step-up-token': options.stepUpToken } : {},
    method: 'POST',
    url: '/records/x/certificate',
  } as unknown as AuthenticatedRequest;
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardFor(
  action: StepUpAction | undefined,
  opts: { consumed?: boolean } = {},
): { guard: StepUpGuard; audit: { record: ReturnType<typeof vi.fn>; eventExists: ReturnType<typeof vi.fn> } } {
  const reflector = { getAllAndOverride: () => action } as unknown as Reflector;
  const audit = {
    record: vi.fn(async () => undefined),
    eventExists: vi.fn(async () => Boolean(opts.consumed)),
  } as unknown as AuditService;
  return { guard: new StepUpGuard(reflector, tokens, audit), audit };
}

async function stepUpToken(subject = USER, options: { jti?: string; action?: string } = {}): Promise<string> {
  return tokens.signToken({
    subject,
    purpose: 'step_up',
    ttlSeconds: 300,
    jti: options.jti,
    action: options.action,
  });
}

describe('StepUpGuard — fresh, single-use assertions only', () => {
  it('denies a guarded route with no @RequireStepUp metadata', async () => {
    const { guard } = guardFor(undefined);
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null } }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies when no step-up token is presented', async () => {
    const { guard } = guardFor('certificate.issue');
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null } }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request', async () => {
    const { guard } = guardFor('certificate.issue');
    await expect(
      guard.canActivate(contextFor(fakeRequest({ stepUpToken: 'x' }))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid, unused assertion and records its consumption', async () => {
    const { guard, audit } = guardFor('certificate.issue');
    const token = await stepUpToken(USER, { jti: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: token }))),
    ).resolves.toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.step_up.consumed' }),
    );
  });

  it('rejects a replayed assertion', async () => {
    const { guard } = guardFor('certificate.issue', { consumed: true });
    const token = await stepUpToken(USER, { jti: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: token }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a step-up token minted for another user', async () => {
    const { guard } = guardFor('certificate.issue');
    const token = await stepUpToken('22222222-2222-2222-2222-222222222222');
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: token }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a step-up token without a jti (not single-use)', async () => {
    const { guard } = guardFor('certificate.issue');
    const token = await stepUpToken(USER, { jti: undefined });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: token }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an action-scoped assertion used for a different action', async () => {
    const { guard } = guardFor('certificate.revoke');
    const token = await stepUpToken(USER, { action: 'certificate.issue' });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: token }))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a non-step-up token', async () => {
    const { guard } = guardFor('certificate.issue');
    const access = await tokens.signToken({ subject: USER, purpose: 'access', ttlSeconds: 900 });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, stepUpToken: access }))),
    ).rejects.toThrow(ForbiddenException);
  });
});
