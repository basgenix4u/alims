import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Public page frame (ui_ux_specification.md §4.2 — "public visitor: no shell;
 * public header").
 *
 * Unauthenticated visitors get a minimal header and footer rather than the
 * authenticated app shell, which agent_4 owns. Kept deliberately light so the
 * verification page stays inside its ≤2 s budget (PRD §9.2).
 *
 * `<main id="main">` is the target of the skip link in the root layout.
 */

export interface PublicPageFrameProps {
  readonly children: ReactNode;
  /** Constrains the content column; the spec's max content width is 1200 px. */
  readonly width?: 'narrow' | 'wide';
}

export function PublicPageFrame({ children, width = 'narrow' }: PublicPageFrameProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg, #faf9f6)',
      }}
    >
      <header
        style={{
          backgroundColor: 'var(--ink-900, #0b1220)',
          color: 'var(--color-text-inverse, #ffffff)',
        }}
      >
        <div
          style={{
            maxWidth: '75rem',
            margin: '0 auto',
            padding: '0 1.25rem',
            height: '4rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'inherit',
              textDecoration: 'none',
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontSize: '1.25rem',
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="9.2" />
              <circle cx="12" cy="12" r="6.6" strokeWidth={1.2} />
              <path d="M8.5 12.4l2.6 2.6 5-5.4" />
            </svg>
            ALIMS
          </Link>
          <nav aria-label="Public" style={{ marginLeft: 'auto' }}>
            <Link
              href="/search"
              style={{
                color: 'inherit',
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: '0.25rem',
              }}
            >
              Search records
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="main"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: width === 'wide' ? '75rem' : '52rem',
          margin: '0 auto',
          padding: '2rem 1.25rem 3rem',
        }}
      >
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--color-border-soft, #e7e4dc)',
          backgroundColor: 'var(--color-surface, #ffffff)',
        }}
      >
        <div
          style={{
            maxWidth: '75rem',
            margin: '0 auto',
            padding: '1.25rem',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: 'var(--color-text-secondary, #334155)',
          }}
        >
          ALIMS — Preserve. Connect. Activate.
        </div>
      </footer>
    </div>
  );
}
