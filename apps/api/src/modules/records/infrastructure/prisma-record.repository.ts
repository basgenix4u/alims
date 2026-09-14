import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';
import { ResearchRecord } from '../domain/record.entity';
import { RecordRepository } from '../domain/record.repository';

/**
 * Prisma-backed RecordRepository — the production persistence adapter.
 *
 * Every operation runs inside `PrismaService.withTenant()` so PostgreSQL
 * row-level security enforces the tenant boundary (the application role
 * cannot bypass it). A repository that forgot the tenant scope would simply
 * read zero rows — fail closed, not open.
 *
 * Cursor pagination is keyset on (updatedAt DESC, id DESC): stable,
 * collision-free and index-backed (`research_record_owner_updated_idx`).
 * The cursor is opaque to callers: `updatedAt|id`.
 */
@Injectable()
export class PrismaRecordRepository implements RecordRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
  ) {}

  async create(record: ResearchRecord): Promise<ResearchRecord> {
    const created = await this.prisma.withTenant(this.tenants.current(), (tx) =>
      tx.researchRecord.create({
        data: {
          id: record.id,
          nxrId: record.nxrId ?? undefined,
          institutionId: record.institutionId ?? undefined,
          departmentId: record.departmentId ?? undefined,
          programmeId: record.programmeId ?? undefined,
          sessionId: record.sessionId ?? undefined,
          ownerUserId: record.ownerUserId,
          outputType: record.outputType,
          title: record.title,
          abstract: record.abstract ?? undefined,
          disciplines: record.disciplines,
          keywords: record.keywords,
          researchYear: record.researchYear,
          accessLevel: record.accessLevel,
          licence: record.licence,
          status: record.status,
          verificationLevel: record.verificationLevel,
          provenance: record.provenance,
          completionState: record.completionState,
          incompleteReason: record.incompleteReason ?? undefined,
          embargoUntil: record.embargoUntil ? new Date(record.embargoUntil) : undefined,
          researchQuestion: record.researchQuestion ?? undefined,
          methodology: record.methodology ?? undefined,
          fundingSource: record.fundingSource ?? undefined,
          ethicsApprovalRef: record.ethicsApprovalRef ?? undefined,
          datasetLinks: record.datasetLinks ?? [],
          codeLinks: record.codeLinks ?? [],
          languages: record.languages ?? [],
          equipmentUsed: record.equipmentUsed ?? undefined,
          externalPartner: record.externalPartner ?? undefined,
          publicationRefs: record.publicationRefs ?? [],
          patentRefs: record.patentRefs ?? [],
          relatedRecordIds: record.relatedRecordIds ?? [],
          supervisorUserIds: record.supervisorUserIds ?? [],
          metadataProvenance: {
            create: record.metadataProvenance.map((p) => ({
              fieldName: p.field,
              source: p.source,
              confidence: p.confidence,
            })),
          },
        },
        include: { metadataProvenance: true },
      }),
    );
    return fromRow(created);
  }

  async save(record: ResearchRecord): Promise<ResearchRecord> {
    // Both statements run inside the single withTenant transaction: provenance
    // is rewritten atomically with the record (draft edits may change which
    // fields were self-declared vs imported).
    const saved = await this.prisma.withTenant(this.tenants.current(), async (tx) => {
      await tx.recordMetadataProvenance.deleteMany({ where: { recordId: record.id } });
      return tx.researchRecord.update({
        where: { id: record.id },
        data: {
          nxrId: record.nxrId,
          institutionId: record.institutionId,
          departmentId: record.departmentId,
          programmeId: record.programmeId,
          sessionId: record.sessionId,
          outputType: record.outputType,
          title: record.title,
          abstract: record.abstract,
          disciplines: record.disciplines,
          keywords: record.keywords,
          researchYear: record.researchYear,
          accessLevel: record.accessLevel,
          licence: record.licence,
          status: record.status,
          verificationLevel: record.verificationLevel,
          completionState: record.completionState,
          incompleteReason: record.incompleteReason,
          embargoUntil: toDate(record.embargoUntil),
          researchQuestion: record.researchQuestion ?? undefined,
          methodology: record.methodology ?? undefined,
          fundingSource: record.fundingSource ?? undefined,
          ethicsApprovalRef: record.ethicsApprovalRef ?? undefined,
          datasetLinks: record.datasetLinks ?? [],
          codeLinks: record.codeLinks ?? [],
          languages: record.languages ?? [],
          equipmentUsed: record.equipmentUsed ?? undefined,
          externalPartner: record.externalPartner ?? undefined,
          publicationRefs: record.publicationRefs ?? [],
          patentRefs: record.patentRefs ?? [],
          relatedRecordIds: record.relatedRecordIds ?? [],
          supervisorUserIds: record.supervisorUserIds ?? [],
          metadataProvenance: {
            create: record.metadataProvenance.map((p) => ({
              fieldName: p.field,
              source: p.source,
              confidence: p.confidence,
            })),
          },
        },
        include: { metadataProvenance: true },
      });
    });
    return fromRow(saved);
  }

  async findById(id: string): Promise<ResearchRecord | null> {
    const row = await this.prisma.withTenant(this.tenants.current(), (tx) =>
      tx.researchRecord.findUnique({ where: { id }, include: { metadataProvenance: true } }),
    );
    return row ? fromRow(row) : null;
  }

  async findByIds(ids: string[]): Promise<ResearchRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.withTenant(this.tenants.current(), (tx) =>
      tx.researchRecord.findMany({ where: { id: { in: ids } }, include: { metadataProvenance: true } }),
    );
    return rows.map(fromRow);
  }

  async listByOwner(
    ownerUserId: string,
    params: { limit: number; cursor?: string | null },
  ): Promise<{
    items: ResearchRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const cursor = parseCursor(params.cursor);
    const rows = await this.prisma.withTenant(this.tenants.current(), (tx) =>
      tx.researchRecord.findMany({
        where: { ownerUserId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: params.limit + 1,
        ...(cursor
          ? { cursor: { updatedAt: new Date(cursor.updatedAt), id: cursor.id }, skip: 1 }
          : {}),
        include: { metadataProvenance: true },
      }),
    );
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(fromRow),
      nextCursor: hasMore && last ? `${last.updatedAt.toISOString()}|${last.id}` : null,
      hasMore,
    };
  }
}

type Row = Prisma.ResearchRecordGetPayload<{ include: { metadataProvenance: true } }>;

function toDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(iso) : null;
}

function fromRow(row: Row): ResearchRecord {
  return {
    id: row.id,
    nxrId: row.nxrId,
    institutionId: row.institutionId,
    departmentId: row.departmentId,
    programmeId: row.programmeId,
    sessionId: row.sessionId,
    ownerUserId: row.ownerUserId,
    outputType: row.outputType,
    title: row.title,
    abstract: row.abstract,
    disciplines: row.disciplines,
    keywords: row.keywords,
    researchYear: row.researchYear,
    accessLevel: row.accessLevel,
    licence: row.licence,
    status: row.status,
    verificationLevel: row.verificationLevel,
    provenance: row.provenance,
    completionState: row.completionState,
    incompleteReason: row.incompleteReason,
    embargoUntil: row.embargoUntil ? row.embargoUntil.toISOString() : null,
    researchQuestion: row.researchQuestion ?? undefined,
    methodology: row.methodology ?? undefined,
    fundingSource: row.fundingSource ?? undefined,
    ethicsApprovalRef: row.ethicsApprovalRef ?? undefined,
    datasetLinks: row.datasetLinks,
    codeLinks: row.codeLinks,
    languages: row.languages,
    equipmentUsed: row.equipmentUsed ?? undefined,
    externalPartner: row.externalPartner ?? undefined,
    publicationRefs: row.publicationRefs,
    patentRefs: row.patentRefs,
    relatedRecordIds: row.relatedRecordIds,
    supervisorUserIds: row.supervisorUserIds,
    metadataProvenance: row.metadataProvenance.map((p) => ({
      field: p.fieldName,
      source: p.source,
      confidence: p.confidence === null ? null : Number(p.confidence),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseCursor(cursor: string | null | undefined): { updatedAt: string; id: string } | null {
  if (!cursor) return null;
  const [updatedAt, id] = cursor.split('|');
  if (!updatedAt || !id) return null;
  return { updatedAt, id };
}
