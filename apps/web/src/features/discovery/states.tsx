import type { ReactNode } from 'react';
import { toneStyle } from '../certificates/status-vocabulary';

/**
 * Loading, error and empty states (ui_ux_specification.md §5.13).
 *
 * Rules encoded here:
 *  - Skeletons match the final layout so content never jumps; containers carry
 *    `aria-busy`.
 *  - Errors state what happened in plain language and what to do next. The API
 *    `ProblemDetails.detail` is contractually user-safe; stack traces are never
 *    surfaced (PRD §9.1).
 *  - Blocking errors announce via `role="alert"`; progress uses `role="status"`.
 *  - Empty results distinguish "nothing matched" from "results were hidden by
 *    access rules" — honesty about exclusion is a PRD requirement.
 */

export function ErrorPanel({
  title,
  message,
  hint,
}: {
  readonly title: string;
  readonly message: string;
  readonly hint?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        ...toneStyle('danger'),
        display: 'flex',
        gap: '0.75rem',
        padding: '1.25rem 1.5rem',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        border: '1px solid currentColor',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        style={{ flexShrink: 0, marginTop: '0.125rem' }}
      >
        <path d="M10.3 3.9L1.8 18.2a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.4 }}>
          {title}
        </h2>
        <p style={{ margin: '0.375rem 0 0', fontSize: '0.9375rem', lineHeight: 1.6 }}>{message}</p>
        {hint ? (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', lineHeight: 1.6 }}>{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: {
  readonly title: string;
  readonly message: string;
  readonly children?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface, #ffffff)',
        border: '1px dashed var(--color-border-strong, #6b7280)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-muted, #475569)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <h2
        style={{
          margin: '0.75rem 0 0',
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 'var(--text-h3, 1.25rem)',
          color: 'var(--color-text, #0f172a)',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: '0.5rem auto 0',
          maxWidth: '34rem',
          fontSize: '0.9375rem',
          lineHeight: 1.6,
          color: 'var(--color-text-secondary, #334155)',
        }}
      >
        {message}
      </p>
      {children ? <div style={{ marginTop: '1rem' }}>{children}</div> : null}
    </div>
  );
}

/** Skeleton card matching the search-result layout, so nothing shifts on load. */
export function ResultSkeleton() {
  const bar = (width: string, height = '0.75rem') => (
    <span
      style={{
        display: 'block',
        width,
        height,
        borderRadius: '0.25rem',
        backgroundColor: 'var(--color-bg-subtle, #f5f3ee)',
      }}
    />
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        padding: '1.25rem',
        backgroundColor: 'var(--color-surface, #ffffff)',
        border: '1px solid var(--color-border-soft, #e7e4dc)',
        borderRadius: 'var(--radius-lg, 0.75rem)',
      }}
    >
      {bar('70%', '1.125rem')}
      {bar('100%')}
      {bar('85%')}
      {bar('30%', '1.5rem')}
    </div>
  );
}

export function LoadingResults({ count = 3 }: { readonly count?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <p role="status" className="sr-only">
        Loading results
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {Array.from({ length: count }, (_, i) => (
          <ResultSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
