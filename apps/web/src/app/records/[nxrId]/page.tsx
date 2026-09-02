import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPageFrame } from '@/features/discovery/public-page-frame';
import { ErrorPanel } from '@/features/discovery/states';
import { getPublicRecord } from '@/features/discovery/public-api';
import { StatusBadge } from '@/features/certificates/seal';
import {
  presentAccessStatus,
  presentOutputType,
  presentVerificationLevel,
} from '@/features/certificates/status-vocabulary';

/**
 * Public record detail (T-410).
 *
 * Contract: api_specification.md §13 `GET /public/records/:nxrId`.
 * Design:   ui_ux_specification.md §5.9.
 *
 * Renders only the contract's public projection. Restricted titles, abstracts,
 * files, reviewer notes and personal data are never returned to an
 * unauthorised viewer (PRD §6.10, §11.4), so there is nothing here to hide
 * conditionally — absent fields simply do not render.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nxrId: string }>;
}): Promise<Metadata> {
  const { nxrId } = await params;
  const result = await getPublicRecord(nxrId);

  if (result.kind !== 'ok') {
    return { title: 'Research record — ALIMS' };
  }

  return {
    title: `${result.data.title} — ALIMS`,
    description: result.data.abstractExcerpt ?? undefined,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted, #475569)',
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: '0.125rem 0 0', fontSize: '1rem', color: 'var(--color-text, #0f172a)' }}>
        {children}
      </dd>
    </div>
  );
}

export default async function PublicRecordPage({
  params,
}: {
  params: Promise<{ nxrId: string }>;
}) {
  const { nxrId } = await params;
  const result = await getPublicRecord(nxrId);

  if (result.kind === 'not_found') {
    notFound();
  }

  if (result.kind === 'error') {
    return (
      <PublicPageFrame>
        <ErrorPanel
          title="We could not load this record"
          message={result.message}
          hint="The record may still exist — this is a problem reaching the service."
        />
      </PublicPageFrame>
    );
  }

  const record = result.data;
  const level = presentVerificationLevel(record.verificationLevel);
  const access = presentAccessStatus(record.accessStatus);
  const embargo = record.embargoUntil ? new Date(record.embargoUntil) : null;
  const embargoLabel =
    embargo && !Number.isNaN(embargo.getTime())
      ? embargo.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

  return (
    <PublicPageFrame>
      <article>
        <header
          style={{
            paddingBottom: '1.25rem',
            borderBottom: '1px solid var(--color-border-soft, #e7e4dc)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontSize: 'var(--text-h1, 2.25rem)',
              lineHeight: 1.2,
              color: 'var(--color-text, #0f172a)',
            }}
          >
            {record.title}
          </h1>

          <p
            style={{
              margin: '0.5rem 0 0',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary, #334155)',
            }}
          >
            {record.nxrId}
          </p>

          <div
            style={{
              marginTop: '0.875rem',
              display: 'flex',
              flexWrap: 'wrap',
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
              detail={embargoLabel ? `until ${embargoLabel}` : undefined}
            />
          </div>

          <p
            style={{
              margin: '0.75rem 0 0',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: 'var(--color-text-secondary, #334155)',
            }}
          >
            {level.meaning}
          </p>
        </header>

        <dl
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))',
            margin: '1.25rem 0 0',
          }}
        >
          <Field label="Output type">{presentOutputType(record.outputType)}</Field>
          {record.institutionName ? (
            <Field label="Institution">{record.institutionName}</Field>
          ) : null}
          {record.researchYear !== null ? (
            <Field label="Year">{record.researchYear}</Field>
          ) : null}
          {record.discipline ? <Field label="Discipline">{record.discipline}</Field> : null}
        </dl>

        {record.abstract || record.abstractExcerpt ? (
          <section style={{ marginTop: '1.75rem' }}>
            <h2
              style={{
                margin: '0 0 0.5rem',
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 'var(--text-h2, 1.75rem)',
                lineHeight: 1.3,
                color: 'var(--color-text, #0f172a)',
              }}
            >
              Abstract
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '1rem',
                lineHeight: 1.7,
                color: 'var(--color-text, #0f172a)',
              }}
            >
              {record.abstract ?? record.abstractExcerpt}
            </p>
          </section>
        ) : null}

        {record.contributors && record.contributors.length > 0 ? (
          <section style={{ marginTop: '1.75rem' }}>
            <h2
              style={{
                margin: '0 0 0.75rem',
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 'var(--text-h2, 1.75rem)',
                lineHeight: 1.3,
                color: 'var(--color-text, #0f172a)',
              }}
            >
              Contributors
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {record.contributors.map((contributor) => (
                <li
                  key={contributor.name}
                  style={{
                    padding: '0.75rem 0',
                    borderTop: '1px solid var(--color-border-soft, #e7e4dc)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                    {contributor.name}
                  </p>
                  {contributor.roles.length > 0 ? (
                    <p
                      style={{
                        margin: '0.125rem 0 0',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        color: 'var(--color-text-secondary, #334155)',
                      }}
                    >
                      {contributor.roles.join(', ')}
                    </p>
                  ) : null}
                  {/* Evidence source is labelled per PRD §6.7 — never presented as fact. */}
                  {contributor.evidenceLabel ? (
                    <span style={{ display: 'inline-block', marginTop: '0.375rem' }}>
                      <StatusBadge label={contributor.evidenceLabel} tone="neutral" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {record.keywords && record.keywords.length > 0 ? (
          <section style={{ marginTop: '1.75rem' }}>
            <h2
              style={{
                margin: '0 0 0.5rem',
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 'var(--text-h3, 1.25rem)',
                color: 'var(--color-text, #0f172a)',
              }}
            >
              Keywords
            </h2>
            <ul
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                margin: 0,
                padding: 0,
                listStyle: 'none',
              }}
            >
              {record.keywords.map((keyword) => (
                <li key={keyword}>
                  <StatusBadge label={keyword} tone="neutral" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {record.relationships && record.relationships.length > 0 ? (
          <section style={{ marginTop: '1.75rem' }}>
            <h2
              style={{
                margin: '0 0 0.5rem',
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 'var(--text-h3, 1.25rem)',
                color: 'var(--color-text, #0f172a)',
              }}
            >
              Related work
            </h2>
            <ul style={{ margin: 0, paddingLeft: '1.125rem' }}>
              {record.relationships.map((rel) => (
                <li key={`${rel.relType}:${rel.targetNxrId}`} style={{ marginTop: '0.375rem' }}>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--color-text-secondary, #334155)',
                    }}
                  >
                    {rel.relType.replace(/_/g, ' ')}:{' '}
                  </span>
                  <Link
                    href={`/records/${encodeURIComponent(rel.targetNxrId)}`}
                    style={{
                      color: 'var(--color-link, #1d4ed8)',
                      textDecoration: 'underline',
                      textUnderlineOffset: '0.2em',
                    }}
                  >
                    {rel.targetTitle}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {record.accessStatus !== 'open' ? (
          <section
            style={{
              marginTop: '1.75rem',
              padding: '1.25rem',
              backgroundColor: 'var(--color-bg-subtle, #f5f3ee)',
              border: '1px solid var(--color-border-soft, #e7e4dc)',
              borderRadius: 'var(--radius-lg, 0.75rem)',
            }}
          >
            <h2
              style={{
                margin: '0 0 0.375rem',
                fontSize: 'var(--text-h3, 1.25rem)',
                fontFamily: 'var(--font-display, Georgia, serif)',
                color: 'var(--color-text, #0f172a)',
              }}
            >
              Access to the full text
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                color: 'var(--color-text-secondary, #334155)',
              }}
            >
              {record.accessStatus === 'embargoed' && embargoLabel
                ? `The full text becomes available on ${embargoLabel}.`
                : access.meaning}
            </p>
          </section>
        ) : null}
      </article>
    </PublicPageFrame>
  );
}
