import {
  publicSearchFiltersSchema,
  SEARCH_FILTER_KEYS,
  type PublicSearchFilters,
} from '@alims/contracts';

// Re-exported for the discovery feature modules: one import site for both the
// contract schemas and the URL helpers.
export {
  accessStatusSchema,
  publicRecordSummarySchema,
  publicRecordDetailSchema,
  publicSearchResponseSchema,
  publicSearchFiltersSchema,
  relationshipIndicatorSchema,
  creditRoleLabelSchema,
  SEARCH_FILTER_KEYS,
} from '@alims/contracts';
export type {
  PublicRecordSummary,
  PublicRecordDetail,
  PublicSearchResponse,
  PublicSearchFilters,
  AccessStatusValue,
} from '@alims/contracts';

/**
 * App-side helpers for the public discovery surface.
 *
 * The schemas themselves live in `@alims/contracts` (spec §13) so the API and
 * the web client share one compile-time contract. Only URL-parameter handling
 * — which is a client concern — lives here.
 */

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
