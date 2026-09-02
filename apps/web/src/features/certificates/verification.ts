import {
  CERTIFICATE_DISCLAIMER,
  publicVerificationSchema,
  type PublicVerification,
} from '@alims/contracts';

/**
 * Public certificate verification — the QR landing data path.
 *
 * Contract: api_specification.md §8 `GET /public/verify/:qrToken` (unauthenticated).
 * The payload carries exactly the ten PRD §6.4 approved fields. This module
 * validates the response against the shared contract schema, so a backend that
 * ever widened the projection would fail here rather than render private data.
 */

export type VerificationStatus = PublicVerification['status'];

/** Shape returned to the page: either a validated payload or a typed failure. */
export type VerificationResult =
  | { kind: 'ok'; verification: PublicVerification }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

/**
 * A QR token is an opaque random identifier carrying no embedded data (PRD §8).
 * Reject anything that is not a plausible opaque token before spending a request,
 * and before interpolating it into a URL.
 */
const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidQrToken(token: string): boolean {
  return QR_TOKEN_PATTERN.test(token);
}

/**
 * The empty projection used when no certificate matches. Rendered as the
 * `not_found` state; it deliberately contains no record data of any kind.
 */
export const NOT_FOUND_VERIFICATION: PublicVerification = {
  status: 'not_found',
  certificateNo: '',
  nxrId: '',
  title: '',
  researcherNames: [],
  institutionName: '',
  outputType: 'other',
  issueDate: '',
  verificationLevel: 'draft',
  supersededBy: null,
  disclaimer: CERTIFICATE_DISCLAIMER,
};

/**
 * Plain-language presentation per ui_ux_specification.md §7.3.
 * `tone` maps to a design-token family; the label and description are the
 * primary signal so status is never conveyed by colour alone (WCAG 1.4.1).
 */
export interface VerificationPresentation {
  readonly headline: string;
  readonly explanation: string;
  readonly tone: 'verified' | 'advisory' | 'danger' | 'neutral';
  readonly seal: 'check' | 'arrow' | 'cross' | 'question';
}

const PRESENTATION: Record<VerificationStatus, VerificationPresentation> = {
  valid: {
    headline: 'Valid certificate',
    explanation:
      'This certificate matches a current verification record held by the issuing institution.',
    tone: 'verified',
    seal: 'check',
  },
  superseded: {
    headline: 'Replaced by a newer certificate',
    explanation:
      'A more recent certificate has been issued for this research record. This is a routine update, not a finding against the work.',
    tone: 'advisory',
    seal: 'arrow',
  },
  revoked: {
    headline: 'No longer valid for verification',
    explanation:
      'The issuing institution has withdrawn this certificate. Contact the institution directly if you need to confirm the underlying record.',
    tone: 'danger',
    seal: 'cross',
  },
  not_found: {
    headline: 'No certificate matches this code',
    explanation:
      'We could not find a certificate for this link. Check that the code was copied in full, or scan the QR code again.',
    tone: 'neutral',
    seal: 'question',
  },
};

export function presentVerification(status: VerificationStatus): VerificationPresentation {
  return PRESENTATION[status];
}

/**
 * Server-side fetch. Runs on the Next.js server, so it targets the internal API
 * URL rather than a relative path; browser code must never reach the API host
 * directly. Kept uncached so a revoked certificate is never served stale.
 */
export async function fetchVerification(qrToken: string): Promise<VerificationResult> {
  if (!isValidQrToken(qrToken)) {
    return { kind: 'not_found' };
  }

  const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

  let response: Response;
  try {
    response = await fetch(
      `${base}/api/v1/public/verify/${encodeURIComponent(qrToken)}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    );
  } catch {
    return {
      kind: 'error',
      message: 'We could not reach the verification service. Please try again shortly.',
    };
  }

  if (response.status === 404) {
    return { kind: 'not_found' };
  }

  if (!response.ok) {
    return {
      kind: 'error',
      message: 'The verification service is temporarily unavailable. Please try again shortly.',
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'error', message: 'The verification service returned an unreadable response.' };
  }

  const parsed = publicVerificationSchema.safeParse(body);
  if (!parsed.success) {
    // Fail closed: an unexpected shape may mean the projection changed.
    // Never render unvalidated fields on a public, unauthenticated surface.
    return { kind: 'error', message: 'This certificate could not be displayed safely.' };
  }

  if (parsed.data.status === 'not_found') {
    return { kind: 'not_found' };
  }

  return { kind: 'ok', verification: parsed.data };
}
