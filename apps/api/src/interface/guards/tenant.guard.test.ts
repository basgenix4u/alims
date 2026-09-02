import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TenantContextService } from '../middleware/tenant-context.service';
import { tenantStorage } from '../middleware/tenant-context';
import { TenantGuard } from './tenant.guard';

const INST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';

interface RequestOptions {
  user?: { userId: string; sessionId: string | null };
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

function fakeRequest(options: RequestOptions = {}) {
  return {
    user: options.user,
    headers: options.headers ?? {},
    params: options.params ?? {},
    body: options.body ?? {},
  } as never;
}

function contextFor(request: ReturnType<typeof fakeRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardFor(membership: { id: string } | null): {
  guard: TenantGuard;
  service: TenantContextService;
  findFirst: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn(async () => membership);
  const prisma = { membership: { findFirst } } as unknown as PrismaService;
  const service = new TenantContextService(prisma);
  return { guard: new TenantGuard(service), service, findFirst };
}

// Ensure every test runs inside a tenant store, as the middleware would.
function runInStore<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ context: null }, fn);
}

describe('TenantGuard — per-request tenant context', () => {
  it('leaves public routes in the system context (no user)', async () => {
    const { guard, service } = guardFor(null);
    const request = fakeRequest();
    await runInStore(async () => {
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(service.current()).toEqual({ institutionId: null, userId: null });
    });
  });

  it('resolves the system context when no tenant is claimed', async () => {
    const { guard, service, findFirst } = guardFor(null);
    const request = fakeRequest({ user: { userId: USER, sessionId: null } });
    await runInStore(async () => {
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(service.current()).toEqual({ institutionId: null, userId: USER });
      expect(findFirst).not.toHaveBeenCalled();
    });
  });

  it('accepts a claimed tenant the user actively belongs to', async () => {
    const { guard, service } = guardFor({ id: 'membership-1' });
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      headers: { 'x-institution-id': INST_A },
    });
    await runInStore(async () => {
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(service.current()).toEqual({ institutionId: INST_A, userId: USER });
    });
  });

  it('claims a tenant from the route param when the header is absent', async () => {
    const { guard, service } = guardFor({ id: 'membership-2' });
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      params: { institutionId: INST_A },
    });
    await runInStore(async () => {
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(service.current()).toEqual({ institutionId: INST_A, userId: USER });
    });
  });

  it('rejects a claimed tenant the user does not belong to', async () => {
    const { guard, findFirst } = guardFor(null);
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      headers: { 'x-institution-id': INST_A },
    });
    await runInStore(async () => {
      await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ institutionId: INST_A }) }),
      );
    });
  });

  it('attaches the resolved context to the request', async () => {
    const { guard } = guardFor({ id: 'membership-3' });
    const request = fakeRequest({
      user: { userId: USER, sessionId: null },
      headers: { 'x-institution-id': INST_A },
    }) as { tenantContext?: unknown };
    await runInStore(async () => {
      await guard.canActivate(contextFor(request));
    });
    expect(request.tenantContext).toEqual({ institutionId: INST_A, userId: USER });
  });
});
