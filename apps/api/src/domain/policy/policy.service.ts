import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
