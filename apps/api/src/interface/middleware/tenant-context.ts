import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { TenantContext } from '../../infrastructure/database/prisma.service';

/**
 * Request-scoped tenant context storage (T-103).
 *
 * The tenant boundary is enforced by PostgreSQL Row-Level Security via the
 * `alims.current_institution` / `alims.current_user` session settings.
 * This AsyncLocalStorage store is the application's in-process mirror: it
 * holds the tenant context resolved for the current request, so any service
 * can hand it to `PrismaService.withTenant()`.
 *
 * AsyncLocalStorage — not a global variable — because concurrent requests
 * on the same event loop must never observe each other's tenant.
 */
interface TenantStore {
  context: TenantContext | null;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Wraps every request in a fresh tenant store.
 *
 * Registered first in main.ts so the store exists before guards resolve the
 * tenant and before any controller runs. The context itself is resolved
 * later — by TenantGuard — once the authenticated user is known.
 */
export function tenantContextMiddleware(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  tenantStorage.run({ context: null }, () => next());
}
