import { describe, expect, it } from 'vitest';
import {
  ABSTRACT_MAX, ABSTRACT_MIN, CERTIFICATE_DISCLAIMER, DEPOSIT_RECEIPT_STATEMENT,
  FORBIDDEN_PUBLIC_FIELDS, KEYWORDS_MAX, PASSWORD_MIN_LENGTH, STEP_UP_REQUIRED_ACTIONS,
  TITLE_MAX, TITLE_MIN, createRecordSchema, creditRoleSchema, publicVerificationSchema,
  registerSchema, verificationLevelSchema,
  SEARCH_FILTER_KEYS, publicRecordDetailSchema, publicRecordSummarySchema,
  publicSearchFiltersSchema, publicSearchResponseSchema,
} from './index';

/**
 * These tests encode PRD guarantees that must never regress.
 * They are deliberately blunt: if someone weakens a rule, CI fails loudly.
 */

const validRecord = {
  outputType: 'thesis' as const,
  title: 'A Study of Soil Degradation in Northern Nigeria',
  disciplines: ['Agriculture'],
  keywords: ['soil', 'degradation'],
  accessLevel: 'metadata_public' as const,
  licence: 'CC-BY-4.0',
};

describe('PRD §6.2 — Research Record field rules', () => {
  it('accepts a valid minimal record', () => {
    expect(createRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it(`rejects a title shorter than ${TITLE_MIN} characters`, () => {
    const r = createRecordSchema.safeParse({ ...validRecord, title: 'Too short' });
    expect(r.success).toBe(false);
  });

  it(`rejects a title longer than ${TITLE_MAX} characters`, () => {
    const r = createRecordSchema.safeParse({ ...validRecord, title: 'a'.repeat(TITLE_MAX + 1) });
    expect(r.success).toBe(false);
  });

  it(`rejects an abstract shorter than ${ABSTRACT_MIN} characters`, () => {
    const r = createRecordSchema.safeParse({ ...validRecord, abstract: 'too short' });
    expect(r.success).toBe(false);
  });

  it(`accepts an abstract at exactly ${ABSTRACT_MIN} characters`, () => {
    const r = createRecordSchema.safeParse({ ...validRecord, abstract: 'a'.repeat(ABSTRACT_MIN) });
    expect(r.success).toBe(true);
  });

  it(`rejects an abstract longer than ${ABSTRACT_MAX} characters`, () => {
    const r = createRecordSchema.safeParse({ ...validRecord, abstract: 'a'.repeat(ABSTRACT_MAX + 1) });
    expect(r.success).toBe(false);
  });

  it('requires at least one keyword', () => {
    expect(createRecordSchema.safeParse({ ...validRecord, keywords: [] }).success).toBe(false);
  });

  it(`rejects more than ${KEYWORDS_MAX} keywords`, () => {
    const keywords = Array.from({ length: KEYWORDS_MAX + 1 }, (_, i) => `k${i}`);
    expect(createRecordSchema.safeParse({ ...validRecord, keywords }).success).toBe(false);
  });

  it('requires at least one discipline', () => {
    expect(createRecordSchema.safeParse({ ...validRecord, disciplines: [] }).success).toBe(false);
  });

  it('allows saving a draft without an abstract (PRD §6.2 draft rule)', () => {
    const { abstract: _abstract, ...noAbstract } = { ...validRecord, abstract: undefined };
    expect(createRecordSchema.safeParse(noAbstract).success).toBe(true);
  });
});

describe('PRD §6.7 — CRediT contributor roles', () => {
  it('defines exactly the 14 NISO CRediT roles', () => {
    expect(creditRoleSchema.options).toHaveLength(14);
  });

  it('includes supervision as a role distinct from authorship', () => {
    expect(creditRoleSchema.options).toContain('supervision');
  });

  it('has no scoring or ranking role', () => {
    const forbidden = ['score', 'rank', 'seniority', 'quality'];
    for (const role of creditRoleSchema.options) {
      for (const bad of forbidden) expect(role).not.toContain(bad);
    }
  });
});

describe('PRD §6.4 — verification labels stay distinct', () => {
  it('defines all 10 verification levels', () => {
    expect(verificationLevelSchema.options).toHaveLength(10);
  });

  it('keeps self_published separate from institutionally_verified', () => {
    expect(verificationLevelSchema.options).toContain('self_published');
    expect(verificationLevelSchema.options).toContain('institutionally_verified');
  });
});

describe('PRD §6.4 — public certificate exposes only approved fields', () => {
  const validPayload = {
    status: 'valid' as const,
    certificateNo: 'CERT-2026-000001',
    nxrId: 'NXR-2026-7K3M9QX2ZB',
    title: 'A Study of Soil Degradation in Northern Nigeria',
    researcherNames: ['A. Abdulalim'],
    institutionName: 'Federal University Wukari',
    outputType: 'thesis' as const,
    issueDate: '2026-08-14',
    verificationLevel: 'institutionally_verified' as const,
    supersededBy: null,
    disclaimer: CERTIFICATE_DISCLAIMER,
  };

  it('accepts a well-formed public verification payload', () => {
    expect(publicVerificationSchema.safeParse(validPayload).success).toBe(true);
  });

  it('strips any private field that is smuggled in', () => {
    const leaky = { ...validPayload, grade: 'A', studentId: 'FUW/2020/123', similarityScore: 42 };
    const parsed = publicVerificationSchema.parse(leaky) as Record<string, unknown>;
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      expect(parsed).not.toHaveProperty(field);
    }
  });

  it('pins the disclaimer so no caller can weaken the legal wording', () => {
    const weakened = { ...validPayload, disclaimer: 'This proves ownership.' };
    expect(publicVerificationSchema.safeParse(weakened).success).toBe(false);
  });

  it('never claims copyright ownership or degree award', () => {
    expect(CERTIFICATE_DISCLAIMER).toMatch(/Not a legal determination/i);
  });
});

describe('PRD §6.3 — deposit receipt cannot overclaim', () => {
  it('states it is evidence only, not proof of ownership', () => {
    expect(DEPOSIT_RECEIPT_STATEMENT).toMatch(/Not proof of legal ownership/i);
  });
});

describe('PRD §9.1 — authentication hardening', () => {
  it('enforces a minimum password length of 12', () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
    expect(registerSchema.safeParse({
      email: 'a@b.co', password: 'short', displayName: 'Test User',
    }).success).toBe(false);
  });

  it('accepts a compliant registration', () => {
    expect(registerSchema.safeParse({
      email: 'researcher@university.edu.ng',
      password: 'a-sufficiently-long-passphrase',
      displayName: 'Abdulbasit Abdulalim',
    }).success).toBe(true);
  });

  it('requires step-up MFA for every high-impact action', () => {
    expect(STEP_UP_REQUIRED_ACTIONS).toContain('certificate.issue');
    expect(STEP_UP_REQUIRED_ACTIONS).toContain('certificate.revoke');
    expect(STEP_UP_REQUIRED_ACTIONS).toContain('institution.status.change');
  });
});


describe('PRD §6.10 / spec §13 — public discovery contracts', () => {
  const summary = {
    nxrId: 'NXR-2026-000042',
    title: 'A Study Of Registry-Mediated Research Deposit Flows',
    outputType: 'thesis',
    contributorsDisplay: ['A. Abdulalim'],
    institutionName: 'University of Example',
    researchYear: 2026,
    abstractExcerpt: 'An excerpt that is safe for public display.',
    verificationLevel: 'institutionally_verified',
    accessStatus: 'open',
    relationshipIndicators: [{ relType: 'builds_on', count: 2 }],
    embargoUntil: null,
  };

  it('exposes exactly the 14 PRD §6.10 search dimensions', () => {
    expect(SEARCH_FILTER_KEYS).toHaveLength(14);
    expect(Object.keys(publicSearchFiltersSchema.shape)).toEqual([...SEARCH_FILTER_KEYS]);
  });

  it('accepts a valid public summary and paginates it', () => {
    const one = publicRecordSummarySchema.parse(summary);
    expect(one.accessStatus).toBe('open');
    const page = publicSearchResponseSchema.parse({
      data: [one],
      pagination: { nextCursor: null, hasMore: false, limit: 20 },
    });
    expect(page.data).toHaveLength(1);
  });

  it('rejects an unknown accessStatus', () => {
    expect(() =>
      publicRecordSummarySchema.parse({ ...summary, accessStatus: 'secret' }),
    ).toThrow();
  });

  it('rejects a negative relationship count', () => {
    expect(() =>
      publicRecordSummarySchema.parse({
        ...summary,
        relationshipIndicators: [{ relType: 'builds_on', count: -1 }],
      }),
    ).toThrow();
  });

  it('detail is the summary widened only with permitted optional fields', () => {
    const detail = publicRecordDetailSchema.parse({
      ...summary,
      abstract: summary.abstractExcerpt,
      keywords: ['registry'],
      discipline: 'Information Science',
      contributors: [{ name: 'A. Abdulalim', roles: ['conceptualization'], evidenceLabel: null }],
      accessLevel: 'full_public',
      relationships: [{ relType: 'builds_on', targetNxrId: 'NXR-2025-000001', targetTitle: 'Prior' }],
    });
    expect(detail.relationships).toHaveLength(1);
    // A bare summary must still parse as a detail (narrower server projection).
    expect(() => publicRecordDetailSchema.parse(summary)).not.toThrow();
  });

  it('carries no field capable of assessment or reviewer-note leakage', () => {
    const keys = new Set(Object.keys(publicRecordDetailSchema.shape));
    for (const forbidden of ['grades', 'similarity', 'reviewerNotes', 'files', 'studentId']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
