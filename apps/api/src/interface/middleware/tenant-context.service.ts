import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PrismaService,
  SYSTEM_CONTEXT,
  type TenantContext,
} from '../../infrastructure/database/prisma.service';
import { tenantStorage } from './tenant-context';

/**
 * Resolves, stores and exposes the tenant context for the current request
 * (T-103).
 *
 * The context is *claimed* by the client (header/param/body) and *proven* by
 * an active membership before it is accepted. A claim without a matching
 * active membership is rejected — otherwise a user could simply declare a
 * foreign institution and read its rows.
 *
 * The database remains the enforcement backstop (RLS); this service only
 * chooses which context to set. It never issues a plain `SET`: context is
 * applied transaction-locally by `PrismaService.withTenant()`, so it cannot
 * leak across pooled connections.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** The tenant context for the current request, or the system context. */
  current(): TenantContext {
    return tenantStorage.getStore()?.context ?? SYSTEM_CONTEXT;
  }

  /** Overwrite the tenant context for the current request. */
  set(context: TenantContext): void {
    const store = tenantStorage.getStore();
    if (store) {
      store.context = context;
    }
  }

  /**
   * Run `work` with `context` visible to `current()` for its duration. If no
   * request store exists (worker/CLI paths), a fresh one is created.
   */
  async run<T>(context: TenantContext, work: () => Promise<T>): Promise<T> {
    const store = tenantStorage.getStore();
    if (store) {
      store.context = context;
      return work();
    }
    return tenantStorage.run({ context }, () => work());
  }

  /**
   * Convenience bridge: run `work` inside `PrismaService.withTenant()` with
   * the current request's context, so queries see the same tenant RLS reads.
   */
  scoped<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.withTenant(this.current(), work);
  }

  /** Where a request may claim its tenant, in priority order. */
  claimFrom(request: {
    headers?: Record<string, string | string[] | undefined>;
    params?: Record<string, string | string[] | undefined>;
    body?: Record<string, unknown>;
  }): string | undefined {
    const header = request.headers?.['x-institution-id'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }

    const param = request.params?.institutionId;
    if (typeof param === 'string' && param.length > 0) {
      return param;
    }

    const bodyValue = request.body?.institutionId;
    if (typeof bodyValue === 'string' && bodyValue.length > 0) {
      return bodyValue;
    }

    return undefined;
  }

  /**
   * Resolve the tenant context for an authenticated user.
   *
   * No claim → system context (no tenant): the user acts on their own rows
   * via the `current_user_id` RLS predicate. A claim must correspond to an
   * active membership of the user, else the request is rejected.
   */
  async resolve(userId: string, claimedInstitutionId: string | undefined): Promise<TenantContext> {
    if (!claimedInstitutionId) {
      return { institutionId: null, userId };
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, institutionId: claimedInstitutionId, status: 'active' },
      select: { id: true },
    });

    if (!membership) {
      // Same safe message as the policy engine: do not confirm which tenants
      // exist for this user (PRD §9.1).
      throw new ForbiddenException('Insufficient permissions.');
    }

    return { institutionId: claimedInstitutionId, userId };
  }
}
