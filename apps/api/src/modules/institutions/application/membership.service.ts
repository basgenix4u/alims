import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  type AddMemberInput,
  type BulkInviteInput,
  type BulkInvitationResult,
  type Member,
  type MemberListQuery,
  type UpdateMemberInput,
} from '@alims/contracts';
import { PolicyEngine } from '../../../domain/policy/policy-engine';
import { PolicyService } from '../../../domain/policy/policy.service';
import type { Resource } from '../../../domain/policy/policy';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';

/**
 * Membership management (api_specification.md §4 "Members", PRD §6.1).
 *
 * An institution controls its own members: registry and inst_admin may
 * list, add, change and revoke memberships — always inside the
 * institution's tenant, always fenced by PostgreSQL row-level security,
 * and always audited. Revocation is a status write, never a hard delete:
 * historical decisions and attribution must survive the member leaving.
 *
 * Route shapes:
 *   GET    /institutions/:institutionId/members   (capability member.read)
 *   POST   /institutions/:institutionId/members   (capability member.manage)
 *   POST   /institutions/:institutionId/members/bulk-invite (202, per-item)
 *   PATCH  /members/:memberId  (capability member.manage + step-up at route)
 *   DELETE /members/:memberId  (capability member.manage; revoke, keep row)
 *
 * The /members/:memberId routes carry no institution in the path; the
 * tenant is the client's proven X-Institution-Id claim and RLS hides
 * every other institution's rows — a foreign member is a 404.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
    private readonly audit: AuditService,
    private readonly policies: PolicyService,
    private readonly engine: PolicyEngine,
  ) {}

  // ── list ───────────────────────────────────────────────────

  async list(institutionId: string, query: MemberListQuery): Promise<{
    items: Member[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const ctx = this.tenants.current();
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.membership.findMany({
        where: {
          institutionId,
          ...(query.role ? { role: query.role } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.q
            ? {
                user: {
                  OR: [
                    { email: { contains: query.q, mode: 'insensitive' } },
                    { displayName: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: { user: { select: { email: true, displayName: true } } },
      }),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => this.toDto(row)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  // ── add (single, direct: the account must already exist) ───

  async add(
    institutionId: string,
    actorUserId: string,
    input: AddMemberInput,
  ): Promise<Member> {
    const ctx = this.tenants.current();
    // Account lookup is global (user_account is not tenant-scoped): the
    // institution must be able to find the person it is enrolling.
    const user = await this.prisma.userAccount.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      // Actionable for staff: the person must register first. This is a
      // member-management surface, not an authentication surface.
      throw new NotFoundException('No ALIMS account exists with that email. The person must register first.');
    }

    const member = await this.prisma.withTenant(ctx, async (tx) => {
      // One membership per (person, institution): a revoked or pending row
      // is re-activated with the requested role rather than duplicated, so
      // membership history stays in exactly one place.
      const existing = await tx.membership.findFirst({
        where: { userId: user.id, institutionId },
      });

      if (existing?.status === 'active') {
        throw new ConflictException(
          `${user.email} is already an active member with the role '${existing.role}'.`,
        );
      }

      if (existing) {
        return tx.membership.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            status: 'active',
            departmentId: input.departmentId ?? null,
            programmeId: input.programmeId ?? null,
          },
        });
      }

      return tx.membership.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          institutionId,
          role: input.role,
          status: 'active',
          departmentId: input.departmentId ?? null,
          programmeId: input.programmeId ?? null,
        },
      });
    });

    await this.audit.record({
      action: 'membership.created',
      subjectType: 'membership',
      subjectId: member.id,
      actorUserId,
      institutionId,
      payload: { email: user.email, role: input.role, mode: 'direct_add' },
    });

    return this.toDto({ ...member, user });
  }

  // ── bulk invite (202; per-item outcomes, never all-or-nothing) ──

  async bulkInvite(
    institutionId: string,
    actorUserId: string,
    input: BulkInviteInput,
  ): Promise<{ invitations: BulkInvitationResult[] }> {
    const ctx = this.tenants.current();
    const results: BulkInvitationResult[] = [];

    for (const item of input.invitations) {
      const user = await this.prisma.userAccount.findUnique({
        where: { email: item.email },
        select: { id: true, email: true, displayName: true },
      });
      if (!user) {
        results.push({ email: item.email, outcome: 'no_account', member: null });
        continue;
      }

      const { member, wasAlreadyActive } = await this.prisma.withTenant(ctx, async (tx) => {
        const existing = await tx.membership.findFirst({
          where: { userId: user.id, institutionId },
        });
        if (existing && existing.status === 'active') {
          return { member: existing, wasAlreadyActive: true };
        }
        // Revoked/pending rows (or no row at all): (re)activate with the
        // requested role — one row per (person, institution), never a
        // duplicate. The invitation is the institution vouching.
        if (existing) {
          const row = await tx.membership.update({
            where: { id: existing.id },
            data: {
              role: item.role,
              status: 'active',
              departmentId: item.departmentId ?? null,
              programmeId: item.programmeId ?? null,
            },
          });
          return { member: row, wasAlreadyActive: false };
        }
        const row = await tx.membership.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            institutionId,
            role: item.role,
            status: 'active',
            departmentId: item.departmentId ?? null,
            programmeId: item.programmeId ?? null,
          },
        });
        return { member: row, wasAlreadyActive: false };
      });

      results.push({
        email: user.email,
        outcome: wasAlreadyActive ? 'already_member' : 'invited',
        member: this.toDto({ ...member, user }),
      });
    }

    await this.audit.record({
      action: 'membership.bulk_invited',
      subjectType: 'institution',
      subjectId: institutionId,
      actorUserId,
      institutionId,
      payload: {
        requested: input.invitations.length,
        invited: results.filter((r) => r.outcome === 'invited').length,
        alreadyMember: results.filter((r) => r.outcome === 'already_member').length,
        noAccount: results.filter((r) => r.outcome === 'no_account').length,
      },
    });

    return { invitations: results };
  }

  // ── role/status change (step-up enforced at the route) ─────

  async update(memberId: string, actorUserId: string, input: UpdateMemberInput): Promise<Member> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const member = await this.loadForManagement(memberId, actorUserId, tx);

      if (member.status === 'revoked') {
        throw new ConflictException(
          'A revoked membership is terminal. Add the person as a new member instead.',
        );
      }
      if (input.status === 'pending') {
        throw new ConflictException('A membership cannot return to pending.');
      }

      const row = await tx.membership.update({
        where: { id: memberId },
        data: {
          ...(input.role ? { role: input.role } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(input.programmeId !== undefined ? { programmeId: input.programmeId } : {}),
        },
        include: { user: { select: { email: true, displayName: true } } },
      });

      await this.audit.record(
        {
          action: 'membership.updated',
          subjectType: 'membership',
          subjectId: memberId,
          actorUserId,
          institutionId: member.institutionId,
          payload: {
            role: input.role ?? null,
            status: input.status ?? null,
          },
        },
        tx,
      );

      return this.toDto(row);
    });
  }

  // ── revoke (never a hard delete) ───────────────────────────

  async revoke(memberId: string, actorUserId: string): Promise<void> {
    const ctx = this.tenants.current();
    await this.prisma.withTenant(ctx, async (tx) => {
      const member = await this.loadForManagement(memberId, actorUserId, tx);
      if (member.status === 'revoked') {
        return; // idempotent: the outcome the caller asked for already holds
      }
      await tx.membership.update({
        where: { id: memberId },
        data: { status: 'revoked' },
      });
      await this.audit.record(
        {
          action: 'membership.revoked',
          subjectType: 'membership',
          subjectId: memberId,
          actorUserId,
          institutionId: member.institutionId,
          payload: { email: member.user.email, role: member.role },
        },
        tx,
      );
    });
  }

  // ── internals ─────────────────────────────────────────────

  private membershipInclude = {
    include: { user: { select: { email: true, displayName: true } } },
  } as const;

  /**
   * Load a membership for a management action: capability check against
   * the row's institution (the /members/:memberId routes carry no
   * institution in the path — the client's proven claim plus RLS scope
   * the access; a foreign member is simply not visible), and the actor
   * may never manage their own membership.
   */
  private async loadForManagement(
    memberId: string,
    actorUserId: string,
    tx: Prisma.TransactionClient,
  ) {
    const member = await tx.membership.findUnique({
      where: { id: memberId },
      ...this.membershipInclude,
    });
    if (!member) {
      throw new NotFoundException('Member not found.');
    }

    const actor = await this.policies.resolveActor(actorUserId, tx);
    const resource: Resource = {
      kind: 'member',
      id: memberId,
      institutionId: member.institutionId,
    };
    const decision = this.engine.authorize(actor, 'member:update', resource);
    if (!decision.allowed) {
      throw new NotFoundException('Member not found.');
    }

    if (member.userId === actorUserId) {
      throw new ConflictException(
        'You cannot change your own membership through this endpoint.',
      );
    }
    return member;
  }

  private toDto(row: {
    id: string;
    userId: string;
    role: Member['role'];
    status: Member['status'];
    departmentId: string | null;
    programmeId: string | null;
    createdAt: Date;
    user: { email: string; displayName: string };
  }): Member {
    return {
      id: row.id,
      userId: row.userId,
      email: row.user.email,
      displayName: row.user.displayName,
      role: row.role,
      status: row.status,
      departmentId: row.departmentId,
      programmeId: row.programmeId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
