import {
  ABSTRACT_MAX,
  ABSTRACT_MIN,
  KEYWORDS_MAX,
  KEYWORDS_MIN,
  TITLE_MAX,
  TITLE_MIN,
} from '@alims/contracts';

/**
 * GET /records/schema field metadata (api_specification.md §5).
 *
 * Single source of truth for the frontend record wizard: requirement level,
 * length limits, and a plain-language explanation of WHY the field is needed
 * and WHO will see it (PRD §6.2 "User-facing validation"). Limits are imported
 * from the shared contracts so client and server can never disagree.
 */

export type FieldVisibility = 'public' | 'institution' | 'private';

export interface RecordFieldSpec {
  field: string;
  required: 'always' | 'for_publication' | 'conditional' | 'optional';
  min?: number;
  max?: number;
  visibility: FieldVisibility;
  helpText: string;
}

export const RECORD_FIELD_SPECS: readonly RecordFieldSpec[] = [
  {
    field: 'outputType',
    required: 'always',
    visibility: 'public',
    helpText: 'The kind of research output. Shown publicly so others can find it by type.',
  },
  {
    field: 'title',
    required: 'always',
    min: TITLE_MIN,
    max: TITLE_MAX,
    visibility: 'public',
    helpText:
      `A clear, specific title (${TITLE_MIN}–${TITLE_MAX} characters). ` +
      'Appears in public search results.',
  },
  {
    field: 'abstract',
    required: 'for_publication',
    min: ABSTRACT_MIN,
    max: ABSTRACT_MAX,
    visibility: 'public',
    helpText:
      `A summary (${ABSTRACT_MIN}–${ABSTRACT_MAX} characters). Required before the record can be ` +
      'published or officially submitted; shown publicly to help others decide whether to read it.',
  },
  {
    field: 'disciplines',
    required: 'always',
    min: 1,
    visibility: 'public',
    helpText: 'At least one discipline/field. Multi-disciplinary records are supported.',
  },
  {
    field: 'keywords',
    required: 'always',
    min: KEYWORDS_MIN,
    max: KEYWORDS_MAX,
    visibility: 'public',
    helpText:
      `Between ${KEYWORDS_MIN} and ${KEYWORDS_MAX} keywords. They power discovery and search.`,
  },
  {
    field: 'accessLevel',
    required: 'always',
    visibility: 'institution',
    helpText:
      'Controls who can see the full record. Your choice is stored and enforced by the platform.',
  },
  {
    field: 'licence',
    required: 'always',
    visibility: 'public',
    helpText: 'The rights/licence statement attached to this output.',
  },
  {
    field: 'researchYear',
    required: 'conditional',
    visibility: 'public',
    helpText: 'The year/session the research belongs to. Required for academic outputs.',
  },
  {
    field: 'institutionId',
    required: 'conditional',
    visibility: 'institution',
    helpText:
      'Required for official institutional records; optional for independent work. ' +
      'Shown to your institution, not the general public.',
  },
  {
    field: 'supervisorUserIds',
    required: 'conditional',
    visibility: 'private',
    helpText:
      'Required where your institution’s workflow requires a supervisor. ' +
      'Only your institution and the named supervisor can see this.',
  },
  {
    field: 'researchQuestion',
    required: 'optional',
    visibility: 'public',
    helpText: 'The research question addressed. Helps others assess relevance.',
  },
  {
    field: 'methodology',
    required: 'optional',
    visibility: 'public',
    helpText: 'How the research was conducted.',
  },
  {
    field: 'fundingSource',
    required: 'optional',
    visibility: 'institution',
    helpText: 'Who funded the work. Shown to your institution for reporting.',
  },
  {
    field: 'ethicsApprovalRef',
    required: 'optional',
    visibility: 'institution',
    helpText: 'Ethics approval reference. Kept within your institution.',
  },
  {
    field: 'datasetLinks',
    required: 'optional',
    visibility: 'public',
    helpText: 'Links to datasets associated with this research.',
  },
  {
    field: 'codeLinks',
    required: 'optional',
    visibility: 'public',
    helpText: 'Links to code repositories associated with this research.',
  },
  {
    field: 'equipmentUsed',
    required: 'optional',
    visibility: 'public',
    helpText: 'Equipment or facilities used.',
  },
  {
    field: 'externalPartner',
    required: 'optional',
    visibility: 'institution',
    helpText: 'External partners involved. Shown within your institution.',
  },
  {
    field: 'publicationRefs',
    required: 'optional',
    visibility: 'public',
    helpText: 'Publications linked to this research.',
  },
  {
    field: 'patentRefs',
    required: 'optional',
    visibility: 'public',
    helpText: 'Patent references linked to this research.',
  },
  {
    field: 'languages',
    required: 'optional',
    visibility: 'public',
    helpText: 'Languages the output is written in.',
  },
  {
    field: 'completionState',
    required: 'optional',
    visibility: 'institution',
    helpText:
      'Whether the research is complete or is seeking continuation. ' +
      'Visible to your institution, not the public.',
  },
  {
    field: 'incompleteReason',
    required: 'optional',
    visibility: 'institution',
    helpText: 'Why the research stalled, where that applies.',
  },
  {
    field: 'relatedRecordIds',
    required: 'optional',
    visibility: 'public',
    helpText: 'Other records this research builds on or is related to.',
  },
];

export function getRecordFieldSpec(field: string): RecordFieldSpec | undefined {
  return RECORD_FIELD_SPECS.find((f) => f.field === field);
}
