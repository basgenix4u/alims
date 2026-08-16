import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Tenant context applied to a unit of work.
 *
 * PRD §6.1 / §9.1: the tenant boundary is enforced by PostgreSQL Row-Level
 * Security, not by application `where` clauses. RLS reads these values from
 * session settings, so they must be set on the SAME connection that runs the
 * queries — hence every scoped operation runs inside an interactive
 * transaction where the connection is pinned.
 */
export interface TenantContext {
  /** Institution the actor is acting within. Null for platform-level work. */
  institutionId: string | null;
  /** Authenticated user id. Null for anonymous requests. */
  userId: string | null;
}

export const SYSTEM_CONTEXT: TenantContext = { institutionId: null, userId: null };

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run `work` with the tenant context bound to the transaction's connection.
   *
   * `set_config(..., true)` makes the setting transaction-local, so it is
   * discarded automatically on commit or rollback. That prevents context
   * leaking between requests that reuse a pooled connection — a leak here
   * would be a cross-tenant data breach.
   *
   * Values are passed as bound parameters, never interpolated, so a crafted
   * id cannot inject SQL (OWASP A03).
   */
  async withTenant<T>(
    context: TenantContext,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('alims.current_institution', ${
        context.institutionId ?? ''
      }, true)`;
      await tx.$executeRaw`SELECT set_config('alims.current_user', ${context.userId ?? ''}, true)`;
      return work(tx);
    });
  }

  /** True when the database answers. Used by the health endpoint. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
