import type { Metadata } from 'next';
import { VerificationPanel } from '@/features/certificates/verification-panel';
import { NOT_FOUND_VERIFICATION, fetchVerification } from '@/features/certificates/verification';
import { PublicPageFrame } from '@/features/discovery/public-page-frame';
import { ErrorPanel } from '@/features/discovery/states';

/**
 * QR certificate verification landing page.
 *
 * Contract: api_specification.md §8 `GET /public/verify/:qrToken` — unauthenticated.
 * Design:   ui_ux_specification.md §5.10 (`verify` template), §7.3 status mapping.
 *
 * Budget: ≤2 s to first paint (PRD §9.2). Achieved by server rendering with no
 * client-side data waterfall, zero webfonts and inline SVG only.
 *
 * `noindex` — a certificate link is shared deliberately by its holder and must
 * not become publicly discoverable through search engines.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify a certificate — ALIMS',
  description: 'Check whether an ALIMS verification certificate is currently valid.',
  robots: { index: false, follow: false },
};

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const result = await fetchVerification(qrToken);

  return (
    <PublicPageFrame>
      {result.kind === 'ok' ? <VerificationPanel verification={result.verification} /> : null}

      {result.kind === 'not_found' ? (
        <VerificationPanel verification={NOT_FOUND_VERIFICATION} />
      ) : null}

      {result.kind === 'error' ? (
        <ErrorPanel
          title="We could not check this certificate"
          message={result.message}
          hint="This does not mean the certificate is invalid — only that we could not reach the verification service."
        />
      ) : null}

      <section
        aria-labelledby="what-this-means"
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem 1.5rem',
          backgroundColor: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--color-border-soft, #e7e4dc)',
          borderRadius: 'var(--radius-lg, 0.75rem)',
        }}
      >
        <h2
          id="what-this-means"
          style={{
            margin: '0 0 0.5rem',
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 'var(--text-h3, 1.25rem)',
            color: 'var(--color-text, #0f172a)',
          }}
        >
          What this check does and does not tell you
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            color: 'var(--color-text-secondary, #334155)',
          }}
        >
          A valid result confirms that the issuing institution holds a verification record
          matching this certificate. It does not assess the quality of the work, determine
          copyright ownership, or confirm that a degree was awarded. Assessment details,
          identifiers and review notes are never shown on this page.
        </p>
      </section>
    </PublicPageFrame>
  );
}
