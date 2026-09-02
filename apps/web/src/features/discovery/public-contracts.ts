import { z } from 'zod';
import {
  accessLevelSchema,
  outputTypeSchema,
  paginatedSchema,
  verificationLevelSchema,
} from '@alims/contracts';

/**
 * Runtime schemas for the public discovery surface.
 *
 * Contract: api_specification.md §13 (`GET /public/search`,
 * `GET /public/records/:nxrId`). These shapes are not yet mirrored in
 * `packages/contracts`, which is agent_5-owned and cannot be edited from this
 * branch — see `roadblocks/RB-agent-3-public-contracts-missing.md`. They are
 * transcribed verbatim from the specification and must be replaced by imports
 * from `@alims/contracts` once agent_5 adds them, with no shape change.
 *
 * Composed from the shared enum schemas so an enum change in the contract
 * package breaks this file at compile time rather than drifting silently.
 */

export const accessStatusSchema = z.enum(['open', 'embargoed', 'restricted', 'metadata_only']);
export type AccessStatusValue = z.infer<typeof accessStatusSchema>;

export const relationshipIndicatorSchema = z.object({
  relType: z.string(),
  count: z.number().int().nonnegative(),
});

export const publicRecordSummarySchema = z.object({
  nxrId: z.string(),
  title: z.string(),
  outputType: outputTypeSchema,
  contributorsDisplay: z.array(z.string()),
  institutionName: z.string().nullable(),
  researchYear: z.number().int().nullable(),
  // Omitted entirely when the access level forbids it — never an empty string.
  abstractExcerpt: z.string().nullable(),
  verificationLevel: verificationLevelSchema,
  accessStatus: accessStatusSchema,
  relationshipIndicators: z.array(relationshipIndicatorSchema),
  embargoUntil: z.string().nullable(),
});
export type PublicRecordSummary = z.infer<typeof publicRecordSummarySchema>;

export const publicSearchResponseSchema = paginatedSchema(publicRecordSummarySchema);
export type PublicSearchResponse = z.infer<typeof publicSearchResponseSchema>;

/**
 * `GET /public/records/:nxrId` → `PublicRecordDetail`.
 *
 * The specification names the type but does not enumerate its fields beyond
 * the summary projection plus the §5.9 design requirements. Modelled as the
 * summary widened with the fields §5.9 explicitly permits, all optional so a
 * narrower server projection still parses. Nothing here can carry assessment
 * data, identifiers or reviewer notes.
 */
export const creditRoleLabelSchema = z.object({
  name: z.string(),
  roles: z.array(z.string()),
  evidenceLabel: z.string().nullable(),
});

export const publicRecordDetailSchema = publicRecordSummarySchema.extend({
  abstract: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  discipline: z.string().nullable().optional(),
  contributors: z.array(creditRoleLabelSchema).optional(),
  accessLevel: accessLevelSchema.optional(),
  relationships: z
    .array(z.object({ relType: z.string(), targetNxrId: z.string(), targetTitle: z.string() }))
    .optional(),
});
export type PublicRecordDetail = z.infer<typeof publicRecordDetailSchema>;

/**
 * The 14 PRD §6.10 search dimensions, exactly as named in the contract.
 * Every value is optional; only populated keys are sent as query parameters.
 */
export const publicSearchFiltersSchema = z.object({
  q: z.string().optional(),
  researchQuestion: z.string().optional(),
  discipline: z.string().optional(),
  outputType: outputTypeSchema.optional(),
  researcher: z.string().optional(),
  institution: z.string().optional(),
  country: z.string().optional(),
  year: z.coerce.number().int().min(1000).max(9999).optional(),
  methodology: z.string().optional(),
  verificationLevel: verificationLevelSchema.optional(),
  accessLevel: accessLevelSchema.optional(),
  hasData: z.coerce.boolean().optional(),
  collaborationStatus: z.string().optional(),
  opportunityType: z.string().optional(),
});
export type PublicSearchFilters = z.infer<typeof publicSearchFiltersSchema>;

/** Filter keys in the order they appear in the specification. */
export const SEARCH_FILTER_KEYS = [
  'q',
  'researchQuestion',
  'discipline',
  'outputType',
  'researcher',
  'institution',
  'country',
  'year',
  'methodology',
  'verificationLevel',
  'accessLevel',
  'hasData',
  'collaborationStatus',
  'opportunityType',
] as const satisfies ReadonlyArray<keyof PublicSearchFilters>;

/**
 * Parse untrusted URL search parameters into typed filters.
 *
 * Unknown keys are dropped and malformed values are discarded rather than
 * forwarded, so a crafted query string cannot be reflected into the API call
 * or back into the page.
 */
export function parseSearchFilters(
  params: Record<string, string | string[] | undefined>,
): PublicSearchFilters {
  const candidate: Record<string, string> = {};

  for (const key of SEARCH_FILTER_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim() !== '') {
      candidate[key] = value.trim();
    }
  }

  const parsed = publicSearchFiltersSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  // Drop only the offending keys rather than failing the whole search.
  const clean: Record<string, string> = { ...candidate };
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') delete clean[key];
  }
  return publicSearchFiltersSchema.parse(clean);
}

export function countActiveFilters(filters: PublicSearchFilters): number {
  return SEARCH_FILTER_KEYS.filter(
    (key) => key !== 'q' && filters[key] !== undefined && filters[key] !== '',
  ).length;
}

/** Serialise filters back into a query string, omitting empty values. */
export function toQueryString(filters: PublicSearchFilters, cursor?: string): string {
  const params = new URLSearchParams();
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}
