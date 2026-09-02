import Link from 'next/link';
import { StatusBadge } from '../certificates/seal';
import {
  presentAccessStatus,
  presentOutputType,
  presentVerificationLevel,
} from '../certificates/status-vocabulary';
import type { PublicRecordSummary } from './public-contracts';

/**
 * Public search result card (ui_ux_specification.md §5.12).
 *
 * Shows: title, type, safe contributor display, institution where allowed,
 * year, abstract excerpt (≤2 lines), verification badge, access chip and
 * relationship indicators. Every field comes from the contract's
 * `PublicRecordSummary` projection — there is no path to private data.
 *
 * No score, percentage or ranking is displayed (PRD §1.5).
 */

function formatEmbargo(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ResultCard({ record }: { readonly record: PublicRecordSummary }) {
  const level = presentVerificationLevel(record.verificationLevel);
  const access = presentAccessStatus(record.accessStatus);
  const embargo = record.embargoUntil ? formatEmbargo(record.embargoUntil) : null;

  const meta = [
    presentOutputType(record.outputType),
    record.institutionName,
    record.researchYear !== null ? String(record.researchYear) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <article
      style={{
        padding: '1.25rem',
        backgroundColor: 'var(--color-surface, #ffffff)',
        border: '1px solid var(--color-border-soft, #e7e4dc)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: '1.1875rem',
          lineHeight: 1.35,
        }}
      >
        <Link
          href={`/records/${encodeURIComponent(record.nxrId)}`}
          style={{
            color: 'var(--color-link, #1d4ed8)',
            textDecoration: 'underline',
            textUnderlineOffset: '0.2em',
          }}
        >
          {record.title}
        </Link>
      </h3>

      <p
        style={{
          margin: '0.375rem 0 0',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary, #334155)',
        }}
      >
        {meta.join(' · ')}
      </p>

      {record.contributorsDisplay.length > 0 ? (
        <p
          style={{
            margin: '0.25rem 0 0',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: 'var(--color-text-secondary, #334155)',
          }}
        >
          {record.contributorsDisplay.join(', ')}
        </p>
      ) : null}

      {record.abstractExcerpt ? (
        <p
          style={{
            margin: '0.625rem 0 0',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--color-text, #0f172a)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {record.abstractExcerpt}
        </p>
      ) : null}

      <div
        style={{
          marginTop: '0.875rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <StatusBadge
          label={level.label}
          tone={level.tone}
          seal={level.seal}
          glyph={level.seal === 'full' ? 'check' : 'question'}
        />
        <StatusBadge
          label={access.label}
          tone={access.tone}
          detail={embargo ? `until ${embargo}` : undefined}
        />
        {record.relationshipIndicators.map((rel) => (
          <StatusBadge
            key={rel.relType}
            label={rel.relType.replace(/_/g, ' ')}
            tone="neutral"
            detail={String(rel.count)}
          />
        ))}
      </div>
    </article>
  );
}
