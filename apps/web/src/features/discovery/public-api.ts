import {
  publicRecordDetailSchema,
  publicSearchResponseSchema,
  toQueryString,
  type PublicRecordDetail,
  type PublicSearchFilters,
  type PublicSearchResponse,
} from './public-contracts';

/**
 * Server-side data access for the public discovery surface.
 *
 * Contract: api_specification.md §13. Both endpoints are unauthenticated and
 * read from narrow projections that physically cannot select private columns
 * (contract §1.3 invariant 4).
 *
 * Responses are validated against the contract schemas before rendering. If
 * the server ever returned a wider object, parsing fails and the page shows an
 * error rather than leaking an unexpected field onto a public page.
 */

export type PublicFetchResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const UNREACHABLE = 'We could not reach the search service. Please try again shortly.';
const UNAVAILABLE = 'The search service is temporarily unavailable. Please try again shortly.';
const UNREADABLE = 'The results could not be displayed safely.';

function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
}

async function getJson(path: string): Promise<PublicFetchResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { kind: 'error', message: UNREACHABLE };
  }

  if (response.status === 404) return { kind: 'not_found' };
  if (!response.ok) return { kind: 'error', message: UNAVAILABLE };

  try {
    return { kind: 'ok', data: await response.json() };
  } catch {
    return { kind: 'error', message: UNREADABLE };
  }
}

export async function searchPublicRecords(
  filters: PublicSearchFilters,
  cursor?: string,
): Promise<PublicFetchResult<PublicSearchResponse>> {
  const query = toQueryString(filters, cursor);
  const result = await getJson(`/api/v1/public/search${query ? `?${query}` : ''}`);
  if (result.kind !== 'ok') return result;

  const parsed = publicSearchResponseSchema.safeParse(result.data);
  return parsed.success
    ? { kind: 'ok', data: parsed.data }
    : { kind: 'error', message: UNREADABLE };
}

/**
 * NXR identifiers appear in the URL path. Validate the shape before
 * interpolating, so a crafted identifier cannot alter the request path.
 */
const NXR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

export function isValidNxrId(nxrId: string): boolean {
  return NXR_ID_PATTERN.test(nxrId);
}

export async function getPublicRecord(
  nxrId: string,
): Promise<PublicFetchResult<PublicRecordDetail>> {
  if (!isValidNxrId(nxrId)) return { kind: 'not_found' };

  const result = await getJson(`/api/v1/public/records/${encodeURIComponent(nxrId)}`);
  if (result.kind !== 'ok') return result;

  const parsed = publicRecordDetailSchema.safeParse(result.data);
  return parsed.success
    ? { kind: 'ok', data: parsed.data }
    : { kind: 'error', message: UNREADABLE };
}
