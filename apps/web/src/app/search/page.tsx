import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicPageFrame } from '@/features/discovery/public-page-frame';
import { SearchFilters } from '@/features/discovery/search-filters';
import { ResultCard } from '@/features/discovery/result-card';
import { EmptyState, ErrorPanel } from '@/features/discovery/states';
import { searchPublicRecords } from '@/features/discovery/public-api';
import {
  countActiveFilters,
  parseSearchFilters,
  toQueryString,
} from '@/features/discovery/public-contracts';

/**
 * Public search and discovery (T-410).
 *
 * Contract: api_specification.md §13 `GET /public/search`.
 * Design:   ui_ux_specification.md §5.12, §5.13.
 *
 * Server-rendered from the URL so every result state is shareable and the page
 * works without JavaScript (PRD §9.2 low-bandwidth path). Pagination is the
 * contract's opaque cursor, carried in the query string.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search research records — ALIMS',
  description:
    'Search publicly available research records. Results show verification level and access status.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearchFilters(params);
  const rawCursor = params.cursor;
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined;

  const hasQuery = filters.q !== undefined || countActiveFilters(filters) > 0;
  const result = hasQuery ? await searchPublicRecords(filters, cursor) : null;

  return (
    <PublicPageFrame width="wide">
      <h1
        style={{
          margin: '0 0 0.5rem',
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 'var(--text-h1, 2.25rem)',
          lineHeight: 1.2,
          color: 'var(--color-text, #0f172a)',
        }}
      >
        Search research records
      </h1>
      <p
        style={{
          margin: '0 0 1.5rem',
          maxWidth: '48rem',
          fontSize: '1rem',
          lineHeight: 1.6,
          color: 'var(--color-text-secondary, #334155)',
        }}
      >
        Every result shows how the record was verified and how much of it is publicly
        available. Records that access rules keep private are not listed here.
      </p>

      <SearchFilters filters={filters} />

      <section aria-live="polite" style={{ marginTop: '1.5rem' }}>
        {result === null ? (
          <EmptyState
            title="Start a search"
            message="Enter a topic, title or researcher above, or open Filters to browse by discipline, institution, output type or verification level."
          />
        ) : null}

        {result?.kind === 'error' ? (
          <ErrorPanel
            title="We could not run that search"
            message={result.message}
            hint="Your filters have been kept — try again in a moment."
          />
        ) : null}

        {result?.kind === 'not_found' ? (
          <EmptyState
            title="No results"
            message="Nothing matched these filters. Try removing a filter or using a broader term. Some records may also be hidden because of access rules."
          />
        ) : null}

        {result?.kind === 'ok' ? (
          result.data.data.length === 0 ? (
            <EmptyState
              title="No results"
              message="Nothing matched these filters. Try removing a filter or using a broader term. Some records may also be hidden because of access rules."
            />
          ) : (
            <>
              <h2 className="sr-only">Search results</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {result.data.data.map((record) => (
                  <ResultCard key={record.nxrId} record={record} />
                ))}
              </div>

              <p
                style={{
                  marginTop: '1.25rem',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary, #334155)',
                }}
              >
                Some records may be hidden because of institutional access rules.
              </p>

              {result.data.pagination.hasMore && result.data.pagination.nextCursor ? (
                <p style={{ marginTop: '1rem' }}>
                  <Link
                    href={`/search?${toQueryString(filters, result.data.pagination.nextCursor)}`}
                    style={{
                      display: 'inline-block',
                      padding: '0.5rem 1.25rem',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: 'var(--color-link, #1d4ed8)',
                      border: '1px solid var(--color-border-input, #857f72)',
                      borderRadius: 'var(--radius-md, 0.5rem)',
                      textDecoration: 'none',
                    }}
                  >
                    Next page
                  </Link>
                </p>
              ) : null}
            </>
          )
        ) : null}
      </section>
    </PublicPageFrame>
  );
}
