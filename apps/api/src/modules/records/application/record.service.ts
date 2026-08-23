import { Inject, Injectable } from '@nestjs/common';
import {
  ABSTRACT_MIN,
  KEYWORDS_MIN,
  createRecordSchema,
  updateRecordSchema,
} from '@alims/contracts';
import { randomUUID } from 'node:crypto';
import { ResearchRecord, RecordDraftInput } from '../domain/record.entity';
import { RECORD_REPOSITORY, RecordRepository } from '../domain/record.repository';
import { RECORD_FIELD_SPECS } from '../domain/record-fields';
import { RecordsDomainError } from './records-errors';

/**
 * Application service for the Research Record domain (api_specification.md §5).
 *
 * Encodes the PRD §6.2 / §7.1 invariants:
 *  - a record is created as a `draft`;
 *  - a draft saves without complete publication fields;
 *  - only a draft can be directly edited (`PATCH` → 409 otherwise);
 *  - field length limits are re-validated server-side (contracts are the
 *    runtime validator, the server remains authoritative);
 *  - official submission is blocked until required institutional fields are
 *    complete (distinct 422 codes per missing precondition).
 */
@Injectable()
export class RecordService {
  constructor(
    @Inject(RECORD_REPOSITORY) private readonly repo: RecordRepository,
  ) {}

  async createDraft(ownerUserId: string, input: RecordDraftInput): Promise<ResearchRecord> {
    const parsed = createRecordSchema.safeParse(input);
    if (!parsed.success) {
      throw RecordsDomainError.validation(parsed.error.issues, input);
    }
    const now = new Date().toISOString();
    const record: ResearchRecord = {
      id: randomUUID(),
      nxrId: null,
      institutionId: input.institutionId ?? null,
      departmentId: input.departmentId ?? null,
      programmeId: input.programmeId ?? null,
      sessionId: input.sessionId ?? null,
      ownerUserId,
      outputType: parsed.data.outputType,
      title: parsed.data.title,
      abstract: parsed.data.abstract ?? null,
      disciplines: parsed.data.disciplines,
      keywords: parsed.data.keywords,
      researchYear: parsed.data.researchYear ?? null,
      accessLevel: parsed.data.accessLevel,
      licence: parsed.data.licence,
      status: 'draft',
      verificationLevel: 'draft',
      provenance: 'native',
      completionState: parsed.data.completionState ?? 'complete',
      incompleteReason: parsed.data.incompleteReason ?? null,
      embargoUntil: null,
      researchQuestion: parsed.data.researchQuestion,
      methodology: parsed.data.methodology,
      fundingSource: parsed.data.fundingSource,
      ethicsApprovalRef: parsed.data.ethicsApprovalRef,
      datasetLinks: parsed.data.datasetLinks ?? [],
      codeLinks: parsed.data.codeLinks ?? [],
      languages: parsed.data.languages ?? [],
      relatedRecordIds: parsed.data.relatedRecordIds ?? [],
      supervisorUserIds: parsed.data.supervisorUserIds ?? [],
      metadataProvenance: [
        { field: 'outputType', source: 'self_declared', confidence: null },
        { field: 'title', source: 'self_declared', confidence: null },
        { field: 'disciplines', source: 'self_declared', confidence: null },
        { field: 'keywords', source: 'self_declared', confidence: null },
        { field: 'accessLevel', source: 'self_declared', confidence: null },
        { field: 'licence', source: 'self_declared', confidence: null },
      ],
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.create(record);
  }

  async getById(recordId: string, viewerUserId: string): Promise<ResearchRecord> {
    const record = await this.repo.findById(recordId);
    if (!record) {
      throw RecordsDomainError.notFound();
    }
    // Cross-tenant / unentitled access is surfaced as 404 (no existence leak).
    if (record.ownerUserId !== viewerUserId) {
      throw RecordsDomainError.notFound();
    }
    return record;
  }

  async updateDraft(
    recordId: string,
    ownerUserId: string,
    input: Partial<RecordDraftInput>,
  ): Promise<ResearchRecord> {
    const record = await this.getById(recordId, ownerUserId);
    if (record.status !== 'draft') {
      // PRD §7.1: only a draft can be directly edited.
      throw RecordsDomainError.notDraft();
    }
    const merged = { ...toInput(record), ...input };
    const parsed = updateRecordSchema.safeParse(merged);
    if (!parsed.success) {
      throw RecordsDomainError.validation(parsed.error.issues, input);
    }
    record.title = parsed.data.title!;
    record.abstract = parsed.data.abstract ?? null;
    record.outputType = parsed.data.outputType!;
    record.disciplines = parsed.data.disciplines!;
    record.keywords = parsed.data.keywords!;
    record.accessLevel = parsed.data.accessLevel!;
    record.licence = parsed.data.licence!;
    record.researchYear = parsed.data.researchYear ?? null;
    record.institutionId = parsed.data.institutionId ?? null;
    record.departmentId = parsed.data.departmentId ?? null;
    record.programmeId = parsed.data.programmeId ?? null;
    record.sessionId = parsed.data.sessionId ?? null;
    record.completionState = parsed.data.completionState ?? 'complete';
    record.incompleteReason = parsed.data.incompleteReason ?? null;
    if (parsed.data.researchQuestion !== undefined) record.researchQuestion = parsed.data.researchQuestion;
    if (parsed.data.methodology !== undefined) record.methodology = parsed.data.methodology;
    if (parsed.data.fundingSource !== undefined) record.fundingSource = parsed.data.fundingSource;
    if (parsed.data.ethicsApprovalRef !== undefined) record.ethicsApprovalRef = parsed.data.ethicsApprovalRef;
    if (parsed.data.datasetLinks !== undefined) record.datasetLinks = parsed.data.datasetLinks;
    if (parsed.data.codeLinks !== undefined) record.codeLinks = parsed.data.codeLinks;
    if (parsed.data.languages !== undefined) record.languages = parsed.data.languages;
    if (parsed.data.relatedRecordIds !== undefined) record.relatedRecordIds = parsed.data.relatedRecordIds;
    if (parsed.data.supervisorUserIds !== undefined) record.supervisorUserIds = parsed.data.supervisorUserIds;
    record.updatedAt = new Date().toISOString();
    return this.repo.save(record);
  }

  async listMine(
    ownerUserId: string,
    params: { limit: number; cursor?: string | null },
  ) {
    return this.repo.listByOwner(ownerUserId, params);
  }

  /**
   * PRD §6.2 / §11.1: submission is blocked until required institutional
   * fields are complete. Each failure returns a distinct 422 code so the UI
   * can point at exactly what to fix.
   */
  assertReadyForSubmission(record: ResearchRecord): void {
    const missing: Array<{ field: string; code: string; message: string }> = [];

    const checkRequired = (
      field: string,
      ok: boolean,
      code: string,
      message: string,
    ) => {
      if (!ok) missing.push({ field, code, message });
    };

    checkRequired(
      'abstract',
      record.abstract !== null && record.abstract.length >= ABSTRACT_MIN,
      'ABSTRACT_REQUIRED',
      'An abstract is required to submit (100–10,000 characters).',
    );
    checkRequired(
      'institutionId',
      record.institutionId !== null,
      'INSTITUTION_REQUIRED',
      'Official records require an institution. Add it before submitting.',
    );
    checkRequired(
      'disciplines',
      record.disciplines.length > 0,
      'DISCIPLINES_REQUIRED',
      'At least one discipline is required.',
    );
    checkRequired(
      'keywords',
      record.keywords.length >= KEYWORDS_MIN,
      'KEYWORDS_REQUIRED',
      `At least ${KEYWORDS_MIN} keyword is required for a discoverable record.`,
    );

    if (missing.length > 0) {
      throw RecordsDomainError.submissionIncomplete(missing);
    }
  }

  getFieldSchema() {
    return { fields: [...RECORD_FIELD_SPECS] };
  }
}

function toInput(r: ResearchRecord): RecordDraftInput {
  return {
    outputType: r.outputType,
    title: r.title,
    abstract: r.abstract ?? undefined,
    institutionId: r.institutionId ?? undefined,
    departmentId: r.departmentId ?? undefined,
    programmeId: r.programmeId ?? undefined,
    sessionId: r.sessionId ?? undefined,
    disciplines: r.disciplines,
    keywords: r.keywords,
    researchYear: r.researchYear ?? undefined,
    accessLevel: r.accessLevel,
    licence: r.licence,
    researchQuestion: r.researchQuestion,
    methodology: r.methodology,
    fundingSource: r.fundingSource,
    ethicsApprovalRef: r.ethicsApprovalRef,
    datasetLinks: r.datasetLinks ?? [],
    codeLinks: r.codeLinks ?? [],
    languages: r.languages ?? [],
    completionState: r.completionState,
    incompleteReason: r.incompleteReason ?? undefined,
    relatedRecordIds: r.relatedRecordIds ?? [],
    supervisorUserIds: r.supervisorUserIds ?? [],
  };
}
