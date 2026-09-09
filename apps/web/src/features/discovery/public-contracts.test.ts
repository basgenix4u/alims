import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PUBLIC_FIELDS } from '@alims/contracts';
import {
  SEARCH_FILTER_KEYS,
  countActiveFilters,
  parseSearchFilters,
  publicRecordSummarySchema,
  toQueryString,
} from './public-contracts';
import { isValidNxrId } from './public-api';

/**
 * Search parameters arrive from an untrusted URL and are forwarded to the API,
 * so parsing is a security boundary, not a convenience.
 */

describe('search filter parsing', () => {
  it('covers all 14 PRD §6.10 dimensions', () => {
    expect(SEARCH_FILTER_KEYS).toHaveLength(14);
  });

  it('keeps valid values', () => {
    const filters = parseSearchFilters({
      q: 'malaria',
      discipline: 'Public Health',
      outputType: 'thesis',
      year: '2024',
    });

    expect(filters.q).toBe('malaria');
    expect(filters.discipline).toBe('Public Health');
    expect(filters.outputType).toBe('thesis');
    expect(filters.year).toBe(2024);
  });

  it('drops keys that are not search dimensions', () => {
    const filters = parseSearchFilters({
      q: 'water',
      // Not a contract dimension — must never reach the API call.
      isAdmin: 'true',
      internalNotes: 'leak',
    } as Record<string, string>);

    expect(toQueryString(filters)).toBe('q=water');
  });

  it('discards an invalid enum instead of forwarding it', () => {
    const filters = parseSearchFilters({ q: 'x', outputType: 'not-a-real-type' });
    expect(filters.outputType).toBeUndefined();
    expect(filters.q).toBe('x');
  });

  it('discards an out-of-range year but keeps the rest of the query', () => {
    const filters = parseSearchFilters({ q: 'soil', year: '99999' });
    expect(filters.year).toBeUndefined();
    expect(filters.q).toBe('soil');
  });

  it('ignores blank and whitespace-only values', () => {
    const filters = parseSearchFilters({ q: '   ', discipline: '' });
    expect(filters.q).toBeUndefined();
    expect(countActiveFilters(filters)).toBe(0);
  });

  it('takes the first value when a key is repeated', () => {
    const filters = parseSearchFilters({ q: ['first', 'second'] });
    expect(filters.q).toBe('first');
  });

  it('escapes values when building the query string', () => {
    const filters = parseSearchFilters({ q: 'a&b=c d' });
    const query = toQueryString(filters);
    expect(query).toBe('q=a%26b%3Dc+d');
    expect(query).not.toContain('a&b=c');
  });

  it('does not count the free-text query as a filter chip', () => {
    expect(countActiveFilters(parseSearchFilters({ q: 'term' }))).toBe(0);
    expect(countActiveFilters(parseSearchFilters({ q: 'term', discipline: 'Law' }))).toBe(1);
  });
});

describe('NXR identifier validation', () => {
  it('accepts ordinary identifiers', () => {
    expect(isValidNxrId('NXR-2026-0001')).toBe(true);
    expect(isValidNxrId('abc123')).toBe(true);
  });

  it('rejects identifiers that could traverse the request path', () => {
    expect(isValidNxrId('../certificates/secret')).toBe(false);
    expect(isValidNxrId('a/b')).toBe(false);
    expect(isValidNxrId('id?admin=1')).toBe(false);
    expect(isValidNxrId('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isValidNxrId('')).toBe(false);
  });
});

describe('public record projection', () => {
  const valid = {
    nxrId: 'NXR-2026-0001',
    title: 'Groundwater quality in the Niger delta',
    outputType: 'thesis',
    contributorsDisplay: ['A. Bello'],
    institutionName: 'University of Abuja',
    researchYear: 2026,
    abstractExcerpt: 'A study of groundwater quality.',
    verificationLevel: 'institutionally_verified',
    accessStatus: 'open',
    relationshipIndicators: [{ relType: 'builds_on', count: 2 }],
    embargoUntil: null,
  };

  it('parses a well-formed summary', () => {
    expect(publicRecordSummarySchema.parse(valid).nxrId).toBe('NXR-2026-0001');
  });

  it('strips any field the contract forbids on a public path', () => {
    // A backend regression that widened the projection must not reach the UI.
    const leaky = {
      ...valid,
      grade: 'A',
      studentId: 'STU-001',
      similarityScore: 12,
      reviewerNotes: 'private',
      email: 'someone@example.com',
    };

    const parsed = publicRecordSummarySchema.parse(leaky) as Record<string, unknown>;
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      expect(parsed).not.toHaveProperty(forbidden);
    }
  });

  it('rejects a summary missing a required contract field', () => {
    const { verificationLevel, ...incomplete } = valid;
    void verificationLevel;
    expect(publicRecordSummarySchema.safeParse(incomplete).success).toBe(false);
  });

  it('treats a withheld abstract as null rather than an empty string', () => {
    const parsed = publicRecordSummarySchema.parse({ ...valid, abstractExcerpt: null });
    expect(parsed.abstractExcerpt).toBeNull();
  });
});
