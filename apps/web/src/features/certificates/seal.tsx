import type { CSSProperties } from 'react';
import type { SealWeight, StatusTone } from './status-vocabulary';
import { toneStyle } from './status-vocabulary';

/**
 * The Scholar's Seal (ui_ux_specification.md §2.2, §8.1).
 *
 * Inline SVG on a 24 px grid with a 2 px stroke — no network request, which
 * keeps the verification page inside its ≤2 s budget on low bandwidth
 * (PRD §9.2). Decorative by default: the adjacent text carries the meaning,
 * so the mark is hidden from assistive technology (WCAG 1.1.1).
 *
 * `full` renders the double ring, reserved for institutional and journal
 * verification (PRD §11.7). Nothing else may use it.
 */

export type SealGlyph = 'check' | 'arrow' | 'cross' | 'question';

const GLYPH_PATHS: Record<SealGlyph, string> = {
  check: 'M8.5 12.4l2.6 2.6 5-5.4',
  arrow: 'M12 15.5V8.8m0 0L9.4 11.4M12 8.8l2.6 2.6',
  cross: 'M9.4 9.4l5.2 5.2m0-5.2l-5.2 5.2',
  question: 'M9.9 10.1a2.1 2.1 0 113 1.9v1.2M12 15.9h.01',
};

export interface SealProps {
  readonly glyph: SealGlyph;
  readonly weight: Exclude<SealWeight, 'none'>;
  readonly size?: number;
  readonly color?: string;
}

export function Seal({ glyph, weight, size = 24, color = 'currentColor' }: SealProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9.2" />
      {weight === 'full' ? <circle cx="12" cy="12" r="6.6" strokeWidth={1.2} /> : null}
      <path d={GLYPH_PATHS[glyph]} />
    </svg>
  );
}

/**
 * Status badge: icon + text + tone, in that reading order.
 *
 * The text label is the primary signal. Removing colour must not remove
 * meaning (WCAG 1.4.1) — verified by `status-vocabulary.test.ts`.
 */
export interface StatusBadgeProps {
  readonly label: string;
  readonly tone: StatusTone;
  readonly seal?: SealWeight;
  readonly glyph?: SealGlyph;
  readonly detail?: string;
}

export function StatusBadge({
  label,
  tone,
  seal = 'none',
  glyph = 'check',
  detail,
}: StatusBadgeProps) {
  const style: CSSProperties = {
    ...toneStyle(tone),
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.25rem 0.625rem',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.4,
  };

  return (
    <span style={style}>
      {seal !== 'none' ? <Seal glyph={glyph} weight={seal} size={16} /> : null}
      <span>{label}</span>
      {detail ? <span style={{ fontWeight: 400, opacity: 0.9 }}>{detail}</span> : null}
    </span>
  );
}
