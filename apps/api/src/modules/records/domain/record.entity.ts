import type {
  AccessLevel,
  IncompleteReason,
  MetadataSource,
  OutputType,
  RecordStatus,
  VerificationLevel,
} from '@alims/contracts';

/** CompletionState (PRD §6.2) — not exported as a named type by contracts. */
export type CompletionState = 'complete' | 'incomplete_seeking_continuation';
/** Provenance (api_specification.md §5) — not exported as a named type by contracts. */
export type Provenance = 'native' | 'historical_digitisation' | 'imported';

/**
 * ResearchRecord aggregate root (api_specification.md §5, PRD §6.2).
 *
 * Mirrors `prisma/schema.prisma` `ResearchRecord` + the API surface. The
 * controller/service only ever touch this in-memory aggregate via the
 * `RecordRepository` port, so a Prisma-backed implementation can be swapped
 * in without touching application logic.
 */
export interface ResearchRecord {
  id: string;
  nxrId: string | null;
  institutionId: string | null;
  departmentId: string | null;
  programmeId: string | null;
  sessionId: string | null;
  ownerUserId: string | null;
  outputType: OutputType;
  title: string;
  abstract: string | null;
  disciplines: string[];
  keywords: string[];
  researchYear: number | null;
  accessLevel: AccessLevel;
  licence: string;
  status: RecordStatus;
  verificationLevel: VerificationLevel;
  provenance: Provenance;
  completionState: CompletionState;
  incompleteReason: IncompleteReason | null;
  embargoUntil: string | null;
  // optional PRD §6.2 fields
  researchQuestion?: string;
  methodology?: string;
  fundingSource?: string;
  ethicsApprovalRef?: string;
  datasetLinks?: string[];
  codeLinks?: string[];
  equipmentUsed?: string;
  externalPartner?: string;
  publicationRefs?: string[];
  patentRefs?: string[];
  languages?: string[];
  relatedRecordIds?: string[];
  supervisorUserIds?: string[];
  metadataProvenance: Array<{
    field: string;
    source: MetadataSource;
    confidence: number | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

/** The draft mutation input accepted by `POST /records` / `PATCH /records/:id`. */
export type RecordDraftInput = {
  outputType: OutputType;
  title: string;
  abstract?: string;
  institutionId?: string;
  departmentId?: string;
  programmeId?: string;
  sessionId?: string;
  disciplines: string[];
  keywords: string[];
  researchYear?: number;
  accessLevel: AccessLevel;
  licence: string;
  researchQuestion?: string;
  methodology?: string;
  fundingSource?: string;
  ethicsApprovalRef?: string;
  datasetLinks?: string[];
  codeLinks?: string[];
  equipmentUsed?: string;
  externalPartner?: string;
  publicationRefs?: string[];
  patentRefs?: string[];
  languages?: string[];
  completionState?: CompletionState;
  incompleteReason?: IncompleteReason;
  relatedRecordIds?: string[];
  supervisorUserIds?: string[];
};
