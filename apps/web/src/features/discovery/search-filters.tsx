import Link from 'next/link';
import {
  ACCESS_LEVEL_OPTIONS,
  OUTPUT_TYPE_OPTIONS,
  VERIFICATION_LEVEL_OPTIONS,
} from '../certificates/status-vocabulary';
import { countActiveFilters, type PublicSearchFilters } from './public-contracts';

/**
 * Search bar and filter panel (ui_ux_specification.md §5.12).
 *
 * The 14 PRD §6.10 dimensions as grouped controls, with the active filter
 * count on the disclosure trigger. Implemented as a plain GET form so search
 * works without JavaScript and every result state is a shareable URL — this is
 * the low-bandwidth path required by PRD §9.2.
 *
 * `<details>` gives an accessible disclosure with no client-side state, and
 * stays open when filters are applied so the user can see what is active.
 */

const labelStyle = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: 'var(--color-text-secondary, #334155)',
} as const;

const controlStyle = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  fontSize: '0.9375rem',
  color: 'var(--color-text, #0f172a)',
  backgroundColor: 'var(--color-surface, #ffffff)',
  border: '1px solid var(--color-border-input, #857f72)',
  borderRadius: 'var(--radius-md, 0.5rem)',
} as const;

function TextFilter({
  name,
  label,
  value,
  placeholder,
}: {
  readonly name: keyof PublicSearchFilters;
  readonly label: string;
  readonly value: string | undefined;
  readonly placeholder?: string;
}) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={value ?? ''}
        placeholder={placeholder}
        style={controlStyle}
      />
    </div>
  );
}

function SelectFilter({
  name,
  label,
  value,
  options,
}: {
  readonly name: keyof PublicSearchFilters;
  readonly label: string;
  readonly value: string | undefined;
  readonly options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ''} style={controlStyle}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilters({ filters }: { readonly filters: PublicSearchFilters }) {
  const activeCount = countActiveFilters(filters);

  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Search public research records"
      style={{
        padding: '1.25rem',
        backgroundColor: 'var(--color-surface, #ffffff)',
        border: '1px solid var(--color-border-soft, #e7e4dc)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
      }}
    >
      <label htmlFor="filter-q" style={labelStyle}>
        Search research records
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <input
          id="filter-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ''}
          placeholder="Title, keyword or topic"
          style={{ ...controlStyle, flex: '1 1 16rem', width: 'auto' }}
        />
        <button
          type="submit"
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--color-primary-fg, #ffffff)',
            backgroundColor: 'var(--color-primary-bg, #1d4ed8)',
            border: '1px solid transparent',
            borderRadius: 'var(--radius-md, 0.5rem)',
            cursor: 'pointer',
          }}
        >
          Search
        </button>
      </div>

      <details open={activeCount > 0} style={{ marginTop: '0.875rem' }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--color-link, #1d4ed8)',
          }}
        >
          Filters
          {activeCount > 0 ? ` (${activeCount} active)` : ''}
        </summary>

        <div
          style={{
            marginTop: '0.875rem',
            display: 'grid',
            gap: '0.875rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))',
          }}
        >
          <TextFilter
            name="researchQuestion"
            label="Research question"
            value={filters.researchQuestion}
          />
          <TextFilter name="discipline" label="Discipline" value={filters.discipline} />
          <SelectFilter
            name="outputType"
            label="Output type"
            value={filters.outputType}
            options={OUTPUT_TYPE_OPTIONS}
          />
          <TextFilter name="researcher" label="Researcher" value={filters.researcher} />
          <TextFilter name="institution" label="Institution" value={filters.institution} />
          <TextFilter name="country" label="Country" value={filters.country} placeholder="e.g. NG" />
          <div>
            <label htmlFor="filter-year" style={labelStyle}>
              Year
            </label>
            <input
              id="filter-year"
              name="year"
              type="number"
              min={1000}
              max={9999}
              defaultValue={filters.year ?? ''}
              style={controlStyle}
            />
          </div>
          <TextFilter name="methodology" label="Methodology" value={filters.methodology} />
          <SelectFilter
            name="verificationLevel"
            label="Verification level"
            value={filters.verificationLevel}
            options={VERIFICATION_LEVEL_OPTIONS}
          />
          <SelectFilter
            name="accessLevel"
            label="Access level"
            value={filters.accessLevel}
            options={ACCESS_LEVEL_OPTIONS}
          />
          <SelectFilter
            name="hasData"
            label="Has underlying data"
            value={filters.hasData === undefined ? undefined : String(filters.hasData)}
            options={[
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' },
            ]}
          />
          <TextFilter
            name="collaborationStatus"
            label="Collaboration status"
            value={filters.collaborationStatus}
          />
          <TextFilter
            name="opportunityType"
            label="Opportunity type"
            value={filters.opportunityType}
          />
        </div>

        <div style={{ marginTop: '0.875rem', display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--color-primary-fg, #ffffff)',
              backgroundColor: 'var(--color-primary-bg, #1d4ed8)',
              border: '1px solid transparent',
              borderRadius: 'var(--radius-md, 0.5rem)',
              cursor: 'pointer',
            }}
          >
            Apply filters
          </button>
          <Link
            href="/search"
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--color-link, #1d4ed8)',
              border: '1px solid var(--color-border-input, #857f72)',
              borderRadius: 'var(--radius-md, 0.5rem)',
              textDecoration: 'none',
            }}
          >
            Clear all
          </Link>
        </div>
      </details>
    </form>
  );
}
