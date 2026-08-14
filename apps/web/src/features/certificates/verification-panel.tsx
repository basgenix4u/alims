import type { PublicVerification } from '@alims/contracts';
import { Seal } from './seal';
import { presentVerification } from './verification';
import { presentOutputType, presentVerificationLevel, toneStyle } from './status-vocabulary';

/**
 * Certificate verification result panel (ui_ux_specification.md §5.10, §7.3).
 *
 * Renders only the ten approved PRD §6.4 fields that the contract defines.
 * There is no code path here that can display a grade, student identifier,
 * similarity figure, reviewer note or contact detail — those fields do not
 * exist on `PublicVerification`, so attempting to read one fails typecheck.
 *
 * Status is carried by headline text, an explanation sentence and a distinct
 * seal glyph. Colour is reinforcement only (WCAG 1.4.1).
 */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
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
      <dd style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text, #0f172a)' }}>
        {children}
      </dd>
    </div>
  );
}

export function VerificationPanel({ verification }: { verification: PublicVerification }) {
  const presentation = presentVerification(verification.status);
  const level = presentVerificationLevel(verification.verificationLevel);
  const tone = toneStyle(presentation.tone);

  const issued = verification.issueDate
    ? new Date(verification.issueDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <article
      aria-labelledby="verification-headline"
      style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        border: '1px solid var(--color-border-strong, #6b7280)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        overflow: 'hidden',
      }}
    >
      {/* Status header — the answer the visitor came for, first and unmissable. */}
      <header
        style={{
          ...tone,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.875rem',
          padding: '1.25rem 1.5rem',
        }}
      >
        <Seal
          glyph={presentation.seal}
          weight={verification.status === 'valid' ? 'full' : 'small'}
          size={40}
        />
        <div>
          <h1
            id="verification-headline"
            style={{
              margin: 0,
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontSize: 'var(--text-h2, 1.75rem)',
              lineHeight: 1.25,
            }}
          >
            {presentation.headline}
          </h1>
          <p style={{ margin: '0.375rem 0 0', fontSize: '1rem', lineHeight: 1.5 }}>
            {presentation.explanation}
          </p>
        </div>
      </header>

      {verification.status === 'not_found' ? null : (
        <div style={{ padding: '1.5rem' }}>
          <h2
            style={{
              margin: '0 0 1.25rem',
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontSize: 'var(--text-h3, 1.25rem)',
              lineHeight: 1.35,
              color: 'var(--color-text, #0f172a)',
            }}
          >
            {verification.title}
          </h2>

          <dl
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))',
              margin: 0,
            }}
          >
            <Field label="Certificate number">
              <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                {verification.certificateNo}
              </span>
            </Field>
            <Field label="Record identifier">
              <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                {verification.nxrId}
              </span>
            </Field>
            <Field label="Institution">{verification.institutionName}</Field>
            <Field label="Output type">{presentOutputType(verification.outputType)}</Field>
            {issued ? <Field label="Issued">{issued}</Field> : null}
            <Field label="Verification level">
              {level.label}
              <span
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  color: 'var(--color-text-secondary, #334155)',
                }}
              >
                {level.meaning}
              </span>
            </Field>
          </dl>

          {verification.researcherNames.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <dl style={{ margin: 0 }}>
                <Field
                  label={
                    verification.researcherNames.length === 1 ? 'Researcher' : 'Researchers'
                  }
                >
                  {verification.researcherNames.join(', ')}
                </Field>
              </dl>
            </div>
          ) : null}

          {verification.status === 'superseded' && verification.supersededBy ? (
            <p
              style={{
                margin: '1.25rem 0 0',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md, 0.5rem)',
                ...toneStyle('advisory'),
                fontSize: '0.9375rem',
                lineHeight: 1.5,
              }}
            >
              Replaced by certificate{' '}
              <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                {verification.supersededBy}
              </span>
              . Ask the holder for the current certificate link.
            </p>
          ) : null}
        </div>
      )}

      {/* The disclaimer is a contract field — always rendered verbatim, never paraphrased. */}
      <footer
        style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--color-border-soft, #e7e4dc)',
          backgroundColor: 'var(--color-bg-subtle, #f5f3ee)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: 'var(--color-text-secondary, #334155)',
          }}
        >
          {verification.disclaimer}
        </p>
      </footer>
    </article>
  );
}
