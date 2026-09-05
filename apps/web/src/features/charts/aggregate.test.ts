import { describe, expect, it } from 'vitest';
import type { RecordSummary } from '@alims/contracts';
import { countByStatus, countByType } from './aggregate';

const sample = (overrides: Partial<RecordSummary>): RecordSummary => ({
  id: '00000000-0000-4000-8000-000000000001',
  nxrId: null,
  title: 'A verified research record title',
  outputType: 'thesis',
  status: 'draft',
  verificationLevel: 'draft',
  accessLevel: 'metadata_public',
  institution: null,
  researchYear: 2026,
  disciplines: ['computer science'],
  contributorsDisplay: [],
  currentVersionNo: 1,
  embargoUntil: null,
  updatedAt: '2026-08-14T00:00:00.000Z',
  ...overrides,
});

describe('chart aggregation', () => {
  it('counts every lifecycle status including zeros', () => {
    const buckets = countByStatus([
      sample({ status: 'draft' }),
      sample({ id: '00000000-0000-4000-8000-000000000002', status: 'published' }),
    ]);
    const draft = buckets.find((b) => b.key === 'draft');
    const published = buckets.find((b) => b.key === 'published');
    const withdrawn = buckets.find((b) => b.key === 'withdrawn');
    expect(draft?.count).toBe(1);
    expect(published?.count).toBe(1);
    expect(withdrawn?.count).toBe(0);
  });

  it('groups by output type', () => {
    const buckets = countByType([
      sample({ outputType: 'thesis' }),
      sample({ id: '00000000-0000-4000-8000-000000000003', outputType: 'thesis' }),
      sample({ id: '00000000-0000-4000-8000-000000000004', outputType: 'dataset' }),
    ]);
    expect(buckets[0]?.key).toBe('thesis');
    expect(buckets[0]?.count).toBe(2);
  });
});
