import { Injectable } from '@nestjs/common';
import {
  CERTIFICATE_DISCLAIMER,
  type PublicRecordDetail,
  type PublicRecordSummary,
  type PublicSearchFilters,
  type PublicVerification,
} from '@alims/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Public surfaces — api_specification.md §8 (verification) and §13
 * (discovery). Every route here is unauthenticated, so the projections are
 * narrow by construction: each query names its columns explicitly and a
 * structurally-wider response cannot happen by accident (PRD §6.4, §6.10,
 * §11.4).
 *
 * Visibility is enforced by row-level security: the public read policy on
 * research_record admits only records whose access level is public AND whose
 * status is institutionally_verified/published — this service runs in the
 * system context and simply receives whatever the database allows.
 */

/** Columns a PublicRecordSummary is built from — nothing else is fetched. */
const SUMMARY_COLUMNS = {
  id: true,
  nxrId: true,
  title: true,
  outputType: true,
  abstract: true,
  accessLevel: true,
  verificationLevel: true,
  researchYear: true,
  embargoUntil: true,
  institutionId: true,
} as const;

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public search over the 14 PRD §6.10 dimensions. Column-backed filters
   * are translated; the free-text query uses the trigger-maintained search
   * vector with a title fallback.
   */
  async search(
    filters: PublicSearchFilters & { limit: number; cursor?: string | null },
  ): Promise<{ data: PublicRecordSummary[]; pagination: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const rows = await this.prisma.researchRecord.findMany({
      where: {
        ...(filters.outputType ? { outputType: filters.outputType } : {}),
        ...(filters.year ? { researchYear: filters.year } : {}),
        ...(filters.verificationLevel ? { verificationLevel: filters.verificationLevel } : {}),
        ...(filters.accessLevel ? { accessLevel: filters.accessLevel } : {}),
        ...(filters.discipline ? { disciplines: { has: filters.discipline } } : {}),
        ...(filters.institution ? { institution: { displayName: { contains: filters.institution, mode: 'insensitive' } } } : {}),
        ...(filters.country ? { institution: { countryCode: filters.country.toUpperCase() } } : {}),
        ...(filters.q
          ? {
              OR: [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { abstract: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: SUMMARY_COLUMNS,
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;

    const summaries = await Promise.all(page.map((row) => this.toSummary(row)));
    return {
      data: summaries,
      pagination: {
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
        hasMore,
        limit: filters.limit,
      },
    };
  }

  /** Public record detail by NXR id — 404-shaped miss handled by the caller. */
  async recordByNxrId(nxrId: string): Promise<PublicRecordDetail | null> {
    const row = await this.prisma.researchRecord.findFirst({
      where: { nxrId },
      select: {
        ...SUMMARY_COLUMNS,
        keywords: true,
        researchQuestion: true,
        methodology: true,
      },
    });
    if (!row) return null;

    const [summary, contributors, relationships] = await Promise.all([
      this.toSummary(row),
      this.contributorLabels(row.id),
      this.prisma.relationship.findMany({
        where: { fromType: 'record', fromId: row.id },
        select: { relType: true, toId: true },
      }),
    ]);

    return {
      ...summary,
      abstract: summary.abstractExcerpt,
      keywords: row.keywords,
      discipline: null,
      contributors,
      relationships: relationships.map((r: { relType: string; toId: string }) => ({
        relType: r.relType,
        targetNxrId: r.toId,
        targetTitle: '',
      })),
    };
  }

  /**
   * Public QR verification (spec §8): exactly the ten PRD §6.4 fields.
   *
   * The read goes through a SECURITY DEFINER function whose SELECT list IS
   * the projection — row-level security keeps non-public records invisible
   * to the anonymous context, while a holder of the opaque QR token still
   * receives the verification facts (PRD §8: the token is the capability).
   * Unknown tokens return `not_found`; existence is never disclosed.
   */
  async verify(qrToken: string): Promise<PublicVerification> {
    const rows = await this.prisma.$queryRaw<Array<{ value: PublicVerification | null }>>`
      SELECT public_verification_by_qr(${qrToken}::text) AS value
    `;
    const result = rows[0]?.value ?? null;
    if (!result) {
      return {
        status: 'not_found',
        certificateNo: '',
        nxrId: '',
        title: '',
        researcherNames: [],
        institutionName: '',
        outputType: 'other',
        issueDate: '',
        verificationLevel: 'draft',
        supersededBy: null,
        disclaimer: CERTIFICATE_DISCLAIMER,
      };
    }
    return result;
  }

  /** Summary projection with embargo-aware excerpt handling (spec §13). */
  private async toSummary(row: {
    id: string;
    nxrId: string | null;
    title: string;
    outputType: string;
    abstract: string | null;
    accessLevel: string;
    verificationLevel: string;
    researchYear: number | null;
    embargoUntil: Date | null;
    institutionId: string | null;
  }): Promise<PublicRecordSummary> {
    const [contributors, institution, indicators] = await Promise.all([
      this.contributorLabels(row.id),
      row.institutionId
        ? this.prisma.institution.findUnique({
            where: { id: row.institutionId },
            select: { displayName: true },
          })
        : Promise.resolve(null),
      this.prisma.relationship.groupBy({
        by: ['relType'],
        where: { fromType: 'record', fromId: row.id },
        _count: { _all: true },
      }),
    ]);

    const embargoed =
      row.embargoUntil !== null && row.embargoUntil.getTime() > Date.now();

    return {
      nxrId: row.nxrId ?? '',
      title: row.title,
      outputType: row.outputType as PublicRecordSummary['outputType'],
      contributorsDisplay: contributors.length > 0 ? contributors.map((c) => c.name) : [],
      institutionName: institution?.displayName ?? null,
      researchYear: row.researchYear,
      // An embargo hides the excerpt entirely — never an empty teaser.
      abstractExcerpt: embargoed ? null : row.abstract?.slice(0, 400) ?? null,
      verificationLevel: row.verificationLevel as PublicRecordSummary['verificationLevel'],
      accessStatus: embargoed
        ? 'embargoed'
        : row.accessLevel === 'full_public'
          ? 'open'
          : row.accessLevel === 'abstract_public'
            ? 'open'
            : row.accessLevel === 'metadata_public'
              ? 'metadata_only'
              : 'restricted',
      relationshipIndicators: indicators.map((i) => ({
        relType: i.relType,
        count: i._count._all,
      })),
      embargoUntil: row.embargoUntil ? row.embargoUntil.toISOString() : null,
    };
  }

  private async contributorLabels(recordId: string) {
    const rows = await this.prisma.contributor.findMany({
      where: { recordId, ackStatus: 'acknowledged' },
      select: {
        externalName: true,
        creditRoles: true,
        user: { select: { displayName: true } },
      },
    });
    return rows.map((r) => ({
      name: r.user?.displayName ?? r.externalName ?? '',
      roles: r.creditRoles as string[],
      evidenceLabel: null,
    }));
  }
}
