import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateInstitutionInput,
  type InstitutionDetail,
  type InstitutionListQuery,
  type InstitutionSummary,
  type InstitutionStatusChangeInput,
  type UpdateInstitutionInput,
  createInstitutionSchema,
  institutionStatusChangeSchema,
  updateInstitutionSchema,
} from '@alims/contracts';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService, type TenantContext } from '../../../infrastructure/database/prisma.service';

/**
 * Institution application service (api_specification.md §4, PRD §6.1).
 *
 * Visibility is enforced by PostgreSQL row-level security: verified
 * institutions are a public directory; every other status is visible only
 * inside the institution's own tenant context. This service decides which
 * context a query runs under — it never filters rows itself.
 */
@Injectable()
export class InstitutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Public directory. Anonymous callers run in the system context, so RLS
   * shows verified institutions only. Authenticated members run in their
   * tenant context, so they additionally see their own (possibly
   * unverified) institution. `status` filtering beyond that is honoured
   * only for callers the database can actually see rows for.
   */
  async list(query: InstitutionListQuery, context: TenantContext): Promise<{
    items: InstitutionSummary[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.prisma.withTenant(context, (tx) =>
      tx.institution.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.country ? { countryCode: query.country } : {}),
          ...(query.q
            ? {
                OR: [
                  { displayName: { contains: query.q, mode: 'insensitive' } },
                  { legalName: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
        ...(query.cursor
          ? { cursor: { id: query.cursor }, skip: 1 }
          : {}),
        select: INSTITUTION_SUMMARY_SELECT,
      }),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      hasMore,
    };
  }

  /** Detail. Unverified institutions 404 for anyone outside their tenant (RLS). */
  async getById(id: string, context: TenantContext): Promise<InstitutionDetail> {
    const row = await this.prisma.withTenant(context, (tx) =>
      tx.institution.findUnique({
        where: { id },
        include: {
          nameHistory: { orderBy: { changedAt: 'asc' } },
        },
      }),
    );
    if (!row) throw new NotFoundException('Institution not found.');
    return {
      ...summaryOf(row),
      legalName: row.legalName,
      officialDomain: row.officialDomain,
      branding: {
        primaryColor: asString((row.branding as Record<string, unknown> | null)?.primaryColor),
        logoUrl: asString((row.branding as Record<string, unknown> | null)?.logoUrl),
      },
      previousNames: row.nameHistory.map((h) => ({
        name: h.previousName,
        changedAt: h.changedAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Onboarding: any authenticated account may apply (spec §4). The
   * institution starts `pending_verification` — the RLS insert policy
   * rejects anything else — and the applicant becomes its first
   * `inst_admin` so the institution is manageable from day one.
   * Verification is a separate, platform-level decision.
   */
  async create(applicantUserId: string, input: CreateInstitutionInput): Promise<InstitutionDetail> {
    const parsed = createInstitutionSchema.parse(input);
    const id = randomUUID();

    // The onboarding transaction runs inside the institution it creates:
    // the id is generated here, so the tenant context is known up front.
    // This also satisfies RETURNING under RLS — a pending institution is
    // invisible to every other context by design.
    const bootstrap: TenantContext = { userId: applicantUserId, institutionId: id };

    const created = await this.prisma.withTenant(bootstrap, async (tx) => {
      const institution = await tx.institution.create({
        data: {
          id,
          legalName: parsed.legalName,
          displayName: parsed.displayName,
          slug: await this.uniqueSlug(tx, parsed.displayName),
          countryCode: parsed.countryCode,
          category: parsed.category,
          officialDomain: parsed.officialDomain.toLowerCase(),
          representativeEmail: parsed.representativeEmail,
          privacyContactEmail: parsed.privacyContactEmail,
          academicEmail: parsed.academicContactEmail,
          libraryEmail: parsed.libraryContactEmail,
          branding: (parsed.branding ?? {}) as object,
        },
      });
      await tx.membership.create({
        data: {
          userId: applicantUserId,
          institutionId: institution.id,
          role: 'inst_admin',
          status: 'active',
        },
      });
      return institution;
    });

    await this.audit.record({
      action: 'institution.created',
      subjectType: 'institution',
      subjectId: created.id,
      actorUserId: applicantUserId,
      institutionId: created.id,
      payload: { displayName: created.displayName, category: created.category },
    });
    await this.audit.record({
      action: 'membership.created',
      subjectType: 'membership',
      subjectId: applicantUserId,
      actorUserId: applicantUserId,
      institutionId: created.id,
      payload: { role: 'inst_admin', reason: 'onboarding_applicant' },
    });

    // The fresh institution is pending — invisible outside its own context —
    // so the detail is assembled from the created row directly.
    return {
      ...summaryOf(created),
      legalName: created.legalName,
      officialDomain: created.officialDomain,
      branding: {
        primaryColor: asString((created.branding as Record<string, unknown> | null)?.primaryColor),
        logoUrl: asString((created.branding as Record<string, unknown> | null)?.logoUrl),
      },
      previousNames: [],
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /** Profile updates by the institution's own administrators. */
  async update(
    id: string,
    actor: TenantContext,
    input: UpdateInstitutionInput,
  ): Promise<InstitutionDetail> {
    const parsed = updateInstitutionSchema.parse(input);
    const existing = await this.getById(id, actor); // 404 outside the tenant (RLS)

    await this.prisma.withTenant(actor, async (tx) => {
      const rename = parsed.legalName && parsed.legalName !== existing.legalName;
      await tx.institution.update({
        where: { id },
        data: {
          ...(parsed.legalName ? { legalName: parsed.legalName } : {}),
          ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
          ...(parsed.officialDomain ? { officialDomain: parsed.officialDomain.toLowerCase() } : {}),
          ...(parsed.representativeEmail ? { representativeEmail: parsed.representativeEmail } : {}),
          ...(parsed.privacyContactEmail
            ? { privacyContactEmail: parsed.privacyContactEmail }
            : {}),
          ...(parsed.academicContactEmail ? { academicEmail: parsed.academicContactEmail } : {}),
          ...(parsed.libraryContactEmail ? { libraryEmail: parsed.libraryContactEmail } : {}),
          ...(parsed.branding ? { branding: { ...existing.branding, ...parsed.branding } as object } : {}),
          // A legal-name change is recorded, never overwritten (PRD §6.1:
          // historical record metadata stays historically accurate).
          ...(rename
            ? { nameHistory: { create: { previousName: existing.legalName } } }
            : {}),
        },
      });
    });

    await this.audit.record({
      action: 'institution.updated',
      subjectType: 'institution',
      subjectId: id,
      actorUserId: actor.userId,
      institutionId: id,
      payload: { fields: Object.keys(parsed) },
    });

    return this.getById(id, actor);
  }

  /**
   * Platform-level status change (verify / suspend / archive). Runs under the
   * target institution's context because the RLS update policy permits
   * writes only from inside the tenant — even for platform administrators.
   */
  async setStatus(
    id: string,
    platformAdminUserId: string,
    input: InstitutionStatusChangeInput,
  ): Promise<InstitutionDetail> {
    const parsed = institutionStatusChangeSchema.parse(input);
    // 404 rather than 403 for unknown ids — existence is not disclosed.
    await this.getById(id, { userId: platformAdminUserId, institutionId: id });

    await this.prisma.withTenant(
      { userId: platformAdminUserId, institutionId: id },
      (tx) =>
        tx.institution.update({
          where: { id },
          data: { status: parsed.status },
        }),
    );

    await this.audit.record({
      action: 'institution.status_changed',
      subjectType: 'institution',
      subjectId: id,
      actorUserId: platformAdminUserId,
      institutionId: id,
      payload: { to: parsed.status, note: parsed.note ?? null },
    });

    return this.getById(id, { userId: platformAdminUserId, institutionId: id });
  }

  /** Slug from the display name, de-duplicated with a short suffix. */
  private async uniqueSlug(
    tx: { institution: { findUnique: (args: { where: { slug: string } }) => Promise<unknown> } },
    displayName: string,
  ): Promise<string> {
    const base =
      displayName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100) || 'institution';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${randomUUID().slice(0, 4)}`;
      const slug = `${base}${suffix}`;
      if (!(await tx.institution.findUnique({ where: { slug } }))) return slug;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}

const INSTITUTION_SUMMARY_SELECT = {
  id: true,
  displayName: true,
  slug: true,
  countryCode: true,
  category: true,
  status: true,
} as const;

type SummaryRow = {
  id: string;
  displayName: string;
  slug: string;
  countryCode: string;
  category: string;
  status: InstitutionSummary['status'];
};

function summaryOf(row: SummaryRow): InstitutionSummary {
  return {
    id: row.id,
    displayName: row.displayName,
    slug: row.slug,
    countryCode: row.countryCode,
    category: row.category,
    status: row.status,
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
