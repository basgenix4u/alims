import type { AccessLevel, OutputType, VerificationLevel } from '@alims/contracts';

/**
 * Plain-language vocabulary for the public surfaces.
 *
 * Source: ui_ux_specification.md §7 (status & verification badge system),
 * which maps api_specification.md §2 enums to labels, tones and seal weight.
 *
 * Binding rules encoded here:
 *  - Every badge is icon + text + tone. Colour is never the sole carrier of
 *    meaning (WCAG 1.4.1, PRD §9.3).
 *  - The full seal is reserved for `institutionally_verified` and
 *    `journal_verified`. `self_published` and `identity_verified_deposit`
 *    must never resemble institutional approval (PRD §11.7).
 *  - No aggregate score, percentage or ranking appears anywhere (PRD §1.5).
 */

export type StatusTone =
  | 'neutral'
  | 'neutral-strong'
  | 'info'
  | 'verified'
  | 'trusted'
  | 'advisory'
  | 'dispute'
  | 'danger'
  | 'journal';

/** Seal weight: `full` is the double-ring institutional seal. */
export type SealWeight = 'none' | 'small' | 'full';

export interface VerificationLevelPresentation {
  readonly label: string;
  readonly tone: StatusTone;
  readonly seal: SealWeight;
  /** Plain-language meaning, shown to non-expert visitors. */
  readonly meaning: string;
}

const VERIFICATION_LEVELS: Record<VerificationLevel, VerificationLevelPresentation> = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    seal: 'none',
    meaning: 'Still being prepared by the researcher. Not submitted for any review.',
  },
  submitted: {
    label: 'Submitted',
    tone: 'info',
    seal: 'none',
    meaning: 'Sent to the institution. No review decision has been made yet.',
  },
  identity_verified_deposit: {
    label: 'Identity-verified deposit',
    tone: 'neutral-strong',
    seal: 'small',
    meaning:
      'The depositor’s identity was confirmed. The content itself has not been reviewed or approved.',
  },
  self_published: {
    label: 'Self-published',
    tone: 'neutral-strong',
    seal: 'small',
    meaning:
      'Published by the researcher on their own authority. No institution has reviewed or endorsed it.',
  },
  supervisor_verified: {
    label: 'Supervisor-verified',
    tone: 'trusted',
    seal: 'small',
    meaning: 'A named academic supervisor confirmed this work and its authorship.',
  },
  institutionally_verified: {
    label: 'Institutionally verified',
    tone: 'verified',
    seal: 'full',
    meaning:
      'A verified institution formally confirmed this record through its own review process.',
  },
  journal_verified: {
    label: 'Journal-verified',
    tone: 'journal',
    seal: 'full',
    meaning: 'Linked to a published version of record held by a journal.',
  },
  under_dispute: {
    label: 'Under dispute',
    tone: 'dispute',
    seal: 'none',
    // PRD §6.4 — a dispute is a process state, never an accusation.
    meaning: 'Under active review. This is not a finding of misconduct.',
  },
  withdrawn: {
    label: 'Withdrawn',
    tone: 'neutral-strong',
    seal: 'none',
    meaning: 'The researcher or institution withdrew this record from circulation.',
  },
  verification_revoked: {
    label: 'Verification revoked',
    tone: 'danger',
    seal: 'none',
    meaning: 'The institution withdrew its earlier confirmation of this record.',
  },
};

export function presentVerificationLevel(level: VerificationLevel): VerificationLevelPresentation {
  return VERIFICATION_LEVELS[level];
}

/** Access status chips on search results (api_specification.md §13). */
export type AccessStatus = 'open' | 'embargoed' | 'restricted' | 'metadata_only';

export interface AccessPresentation {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon: 'globe' | 'clock' | 'lock' | 'document';
  readonly meaning: string;
}

const ACCESS_STATUSES: Record<AccessStatus, AccessPresentation> = {
  open: {
    label: 'Open access',
    tone: 'verified',
    icon: 'globe',
    meaning: 'The full text is available to everyone.',
  },
  embargoed: {
    label: 'Embargoed',
    tone: 'advisory',
    icon: 'clock',
    meaning: 'The full text becomes available on a scheduled date.',
  },
  restricted: {
    label: 'Restricted',
    tone: 'neutral-strong',
    icon: 'lock',
    meaning: 'Access requires permission from the institution.',
  },
  metadata_only: {
    label: 'Details only',
    tone: 'neutral',
    icon: 'document',
    meaning: 'Only the record description is public. The full text is not available here.',
  },
};

export function presentAccessStatus(status: AccessStatus): AccessPresentation {
  return ACCESS_STATUSES[status];
}

/** Human-readable output type labels (api_specification.md §2 `OutputType`). */
const OUTPUT_TYPES: Record<OutputType, string> = {
  project: 'Project',
  thesis: 'Thesis',
  dissertation: 'Dissertation',
  article: 'Article',
  report: 'Report',
  dataset: 'Dataset',
  software: 'Software',
  preprint: 'Preprint',
  patent_disclosure: 'Patent disclosure',
  presentation: 'Presentation',
  other: 'Other',
};

export function presentOutputType(type: OutputType): string {
  return OUTPUT_TYPES[type];
}

export const OUTPUT_TYPE_OPTIONS: ReadonlyArray<{ value: OutputType; label: string }> = (
  Object.keys(OUTPUT_TYPES) as OutputType[]
).map((value) => ({ value, label: OUTPUT_TYPES[value] }));

/** Access levels offered as search filters (api_specification.md §2). */
const ACCESS_LEVELS: Record<AccessLevel, string> = {
  metadata_public: 'Details public',
  abstract_public: 'Abstract public',
  full_public: 'Full text public',
  institution_only: 'Institution only',
  restricted: 'Restricted',
};

export function presentAccessLevel(level: AccessLevel): string {
  return ACCESS_LEVELS[level];
}

export const ACCESS_LEVEL_OPTIONS: ReadonlyArray<{ value: AccessLevel; label: string }> = (
  Object.keys(ACCESS_LEVELS) as AccessLevel[]
).map((value) => ({ value, label: ACCESS_LEVELS[value] }));

/**
 * Verification levels offered as search filters. Ordered by evidence weight so
 * the strongest signal reads first — but never presented as a score or ranking.
 */
export const VERIFICATION_LEVEL_OPTIONS: ReadonlyArray<{
  value: VerificationLevel;
  label: string;
}> = (
  [
    'institutionally_verified',
    'journal_verified',
    'supervisor_verified',
    'identity_verified_deposit',
    'self_published',
    'submitted',
    'under_dispute',
    'withdrawn',
    'verification_revoked',
  ] as VerificationLevel[]
).map((value) => ({ value, label: VERIFICATION_LEVELS[value].label }));

/**
 * Tone → CSS custom properties from agent_6's token system
 * (`apps/web/src/styles/tokens.css`, T-600 / PR #38).
 *
 * Components consume tokens, never hex literals (ui_ux_specification.md §3.6
 * rule 1). The fallback values below are the *same* WCAG-verified colours from
 * spec §3.3, present only so these pages render correctly on `dev` before
 * PR #38 merges. They are confined to this one function — see
 * `roadblocks/RB-agent-3-tokens-not-merged.md`. Once T-600 lands, the second
 * argument of each `var()` should be deleted.
 */
const TONE_FALLBACK: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: '#f8fafc', fg: '#334155' },
  'neutral-strong': { bg: '#f8fafc', fg: '#334155' },
  info: { bg: '#eff4ff', fg: '#1e3a8a' },
  verified: { bg: '#f0fdf4', fg: '#14532d' },
  trusted: { bg: '#f0fdfa', fg: '#115e59' },
  advisory: { bg: '#fffbeb', fg: '#92400e' },
  dispute: { bg: '#fff7ed', fg: '#9a3412' },
  danger: { bg: '#fef2f2', fg: '#991b1b' },
  journal: { bg: '#faf5ff', fg: '#581c87' },
};

export function toneStyle(tone: StatusTone): { backgroundColor: string; color: string } {
  const fallback = TONE_FALLBACK[tone];
  if (tone === 'neutral-strong') {
    return {
      backgroundColor: `var(--status-neutral-bg, ${fallback.bg})`,
      color: `var(--status-neutral-solid, ${fallback.fg})`,
    };
  }
  return {
    backgroundColor: `var(--status-${tone}-bg, ${fallback.bg})`,
    color: `var(--status-${tone}-fg, ${fallback.fg})`,
  };
}
