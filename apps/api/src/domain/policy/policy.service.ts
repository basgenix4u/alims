import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async resolveActor(userId: string): Promise<Actor> {
    const memberships = await this.prisma.membership.findMany({
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
}
