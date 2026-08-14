import { describe, expect, it } from 'vitest';
import { CERTIFICATE_DISCLAIMER, FORBIDDEN_PUBLIC_FIELDS } from '@alims/contracts';
import {
  NOT_FOUND_VERIFICATION,
  isValidQrToken,
  presentVerification,
} from './verification';
import { presentVerificationLevel } from './status-vocabulary';

/**
 * The verification page is unauthenticated and is the surface most likely to
 * leak. These tests assert the PRD invariants that make it safe.
 */

describe('QR token validation', () => {
  it('accepts opaque tokens of a plausible length', () => {
    expect(isValidQrToken('a'.repeat(32))).toBe(true);
    expect(isValidQrToken('Ab3-_x'.repeat(4))).toBe(true);
  });

  it('rejects tokens that could alter the request path', () => {
    // PRD §8: the token is an opaque identifier. Anything with structure is
    // refused before it reaches the URL.
    expect(isValidQrToken('../../admin')).toBe(false);
    expect(isValidQrToken('token/../../etc/passwd')).toBe(false);
    expect(isValidQrToken('a b')).toBe(false);
    expect(isValidQrToken('%2e%2e%2f')).toBe(false);
    expect(isValidQrToken('<script>alert(1)</script>')).toBe(false);
  });

  it('rejects tokens that are too short to be unguessable', () => {
    expect(isValidQrToken('')).toBe(false);
    expect(isValidQrToken('short')).toBe(false);
  });
});

describe('not-found projection', () => {
  it('carries no record data whatsoever', () => {
    expect(NOT_FOUND_VERIFICATION.status).toBe('not_found');
    expect(NOT_FOUND_VERIFICATION.title).toBe('');
    expect(NOT_FOUND_VERIFICATION.certificateNo).toBe('');
    expect(NOT_FOUND_VERIFICATION.nxrId).toBe('');
    expect(NOT_FOUND_VERIFICATION.researcherNames).toHaveLength(0);
    expect(NOT_FOUND_VERIFICATION.institutionName).toBe('');
  });

  it('still states the disclaimer verbatim', () => {
    expect(NOT_FOUND_VERIFICATION.disclaimer).toBe(CERTIFICATE_DISCLAIMER);
  });

  it('exposes no field the contract forbids on a public path', () => {
    const keys = Object.keys(NOT_FOUND_VERIFICATION);
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('status presentation', () => {
  const statuses = ['valid', 'superseded', 'revoked', 'not_found'] as const;

  it('gives every status a distinct headline and seal glyph', () => {
    // WCAG 1.4.1: status must be distinguishable without colour, so the text
    // and the glyph must both differ between states.
    const headlines = statuses.map((s) => presentVerification(s).headline);
    const glyphs = statuses.map((s) => presentVerification(s).seal);
    expect(new Set(headlines).size).toBe(statuses.length);
    expect(new Set(glyphs).size).toBe(statuses.length);
  });

  it('explains every status in plain language', () => {
    for (const status of statuses) {
      expect(presentVerification(status).explanation.length).toBeGreaterThan(20);
    }
  });

  it('never describes a superseded certificate as misconduct', () => {
    const { headline, explanation } = presentVerification('superseded');
    const text = `${headline} ${explanation}`.toLowerCase();
    for (const word of ['fraud', 'misconduct', 'plagiar', 'invalid', 'fake']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('verification level presentation (PRD §11.7)', () => {
  it('reserves the full seal for institutional and journal verification', () => {
    const full = (
      [
        'draft',
        'submitted',
        'identity_verified_deposit',
        'self_published',
        'supervisor_verified',
        'institutionally_verified',
        'journal_verified',
        'under_dispute',
        'withdrawn',
        'verification_revoked',
      ] as const
    ).filter((level) => presentVerificationLevel(level).seal === 'full');

    expect(full.sort()).toEqual(['institutionally_verified', 'journal_verified']);
  });

  it('does not let self-published resemble institutional approval', () => {
    const self = presentVerificationLevel('self_published');
    const institutional = presentVerificationLevel('institutionally_verified');

    expect(self.seal).not.toBe(institutional.seal);
    expect(self.tone).not.toBe(institutional.tone);
    expect(self.label).not.toBe(institutional.label);
    expect(self.meaning.toLowerCase()).toContain('no institution');
  });

  it('states that a dispute is not a misconduct finding', () => {
    expect(presentVerificationLevel('under_dispute').meaning.toLowerCase()).toContain(
      'not a finding of misconduct',
    );
  });

  it('gives every level a unique label', () => {
    const levels = [
      'draft',
      'submitted',
      'identity_verified_deposit',
      'self_published',
      'supervisor_verified',
      'institutionally_verified',
      'journal_verified',
      'under_dispute',
      'withdrawn',
      'verification_revoked',
    ] as const;
    const labels = levels.map((l) => presentVerificationLevel(l).label);
    expect(new Set(labels).size).toBe(levels.length);
  });

  it('never expresses a level as a score, percentage or rank', () => {
    const levels = [
      'draft',
      'submitted',
      'identity_verified_deposit',
      'self_published',
      'supervisor_verified',
      'institutionally_verified',
      'journal_verified',
      'under_dispute',
      'withdrawn',
      'verification_revoked',
    ] as const;

    for (const level of levels) {
      const { label, meaning } = presentVerificationLevel(level);
      expect(`${label} ${meaning}`).not.toMatch(/\d+\s*(%|\/\s*\d|out of|score|rating)/i);
    }
  });
});
