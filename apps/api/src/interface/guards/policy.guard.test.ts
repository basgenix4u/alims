import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PolicyEngine } from '../../domain/policy/policy-engine';
import { PolicyService } from '../../domain/policy/policy.service';
import { AuditService } from '../../infrastructure/audit/audit.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import type { RequireActionMetadata } from '../decorators/require-action.decorator';
import { PolicyGuard } from './policy.guard';

const INST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';

interface FakeRequestOptions {
  user?: AuthenticatedRequest['user'];
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

function fakeRequest(options: FakeRequestOptions = {}): AuthenticatedRequest {
  const request = {
    user: options.user,
    params: options.params ?? {},
    body: options.body ?? {},
    ip: '127.0.0.1',
    method: 'GET',
    url: '/test',
    get: (_header: string) => 'vitest-agent/1.0',
  } as unknown as AuthenticatedRequest;
  return request;
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardFor(
  metadata: RequireActionMetadata | undefined,
  memberships: Awaited<ReturnType<PolicyService['resolveActor']>>['memberships'] = [],
): { guard: PolicyGuard; audit: { record: ReturnType<typeof vi.fn> }; resolveActor: ReturnType<typeof vi.fn> } {
  const reflector = {
    getAllAndOverride: () => metadata,
  } as unknown as Reflector;

  const engine = new PolicyEngine();
  const resolveActor = vi.fn(async (userId: string) => ({ userId, memberships }));
  const policies = { resolveActor } as unknown as PolicyService;
  const audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;

  return { guard: new PolicyGuard(reflector, engine, policies, audit), audit, resolveActor };
}

describe('PolicyGuard — deny by default', () => {
  it('denies a guarded route with no @RequireAction metadata', async () => {
    const { guard } = guardFor(undefined);
    await expect(guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null } })))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a guarded route with an empty metadata object', async () => {
    const { guard } = guardFor({} as RequireActionMetadata);
    await expect(guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null } })))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request', async () => {
    const { guard } = guardFor({ action: 'profile:read_own', ownerFrom: 'self' });
    await expect(guard.canActivate(contextFor(fakeRequest({})))).rejects.toThrow(UnauthorizedException);
  });

  it('allows a self action without resolving memberships', async () => {
    const { guard, resolveActor } = guardFor({ action: 'profile:read_own', ownerFrom: 'self' });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null } }))),
    ).resolves.toBe(true);
    expect(resolveActor).not.toHaveBeenCalled();
  });

  it('fails closed on a capability action with no tenant context', async () => {
    const { guard, audit } = guardFor(
      { action: 'certificate:issue' },
      [{ role: 'registry', institutionId: INST_A, status: 'active' }],
    );
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, params: { id: 'cert-1' } }))),
    ).rejects.toThrow(ForbiddenException);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('allows a capability action when the actor holds the role in the tenant', async () => {
    const { guard } = guardFor(
      { action: 'certificate:issue' },
      [{ role: 'registry', institutionId: INST_A, status: 'active' }],
    );
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      params: { id: 'cert-1', institutionId: INST_A },
    });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('denies a capability action when the actor lacks the role', async () => {
    const { guard } = guardFor(
      { action: 'certificate:issue' },
      [{ role: 'student', institutionId: INST_A, status: 'active' }],
    );
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      params: { id: 'cert-1', institutionId: INST_A },
    });
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
  });

  it('denies an action the engine does not know (typo fails closed)', async () => {
    const { guard } = guardFor({ action: 'certificate:issu' as never });
    await expect(
      guard.canActivate(contextFor(fakeRequest({ user: { userId: USER, sessionId: null }, params: { institutionId: INST_A } }))),
    ).rejects.toThrow(ForbiddenException);
  });
});
