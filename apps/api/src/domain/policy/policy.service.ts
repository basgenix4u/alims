import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { Actor } from './policy';

/**
 * Resolves the {@link Actor} behind a request.
 *
 * Roles come from the membership table at request time — never from the JWT —
 * so a revoked or suspended membership takes effect immediately rather than
 * when the access token expires.
 */
@Injectable()
export class PolicyService {
  private readonly platformAdminIds: ReadonlySet<string>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    const raw = (config.get('PLATFORM_ADMIN_USER_IDS') as string) ?? '';
    this.platformAdminIds = new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );
  }

  /**
   * Resolve the actor's active memberships.
   *
   * The membership table is row-level-security scoped to
   * `current_institution_id()`, so this query is only meaningful INSIDE a
   * tenant context: pass the ambient transaction (`client`) when called
   * from one, or use `resolveActorForTenant` which opens its own.
   */
  async resolveActor(userId: string, client?: Prisma.TransactionClient): Promise<Actor> {
    const db = client ?? this.prisma;
    const memberships = await db.membership.findMany({
      where: { userId, status: 'active' },
      select: { role: true, institutionId: true },
    });

    return {
      userId,
      memberships: memberships.map((membership) => ({
        role: membership.role,
        institutionId: membership.institutionId,
        status: 'active' as const,
      })),
      // Platform authority is configured, never self-claimed (PRD §6.1).
      platformAdmin: this.platformAdminIds.has(userId) || undefined,
    };
  }

  /**
   * Resolve the actor as seen from a specific institution's tenant. The
   * tenant GUC makes exactly that institution's membership rows visible —
   * the caller learns only whether THIS user holds roles THERE, which is
   * precisely the capability question. No cross-tenant data is reachable.
   */
  async resolveActorForTenant(userId: string, institutionId: string): Promise<Actor> {
    return this.prisma.withTenant({ userId, institutionId }, (tx) =>
      this.resolveActor(userId, tx),
    );
  }
}
