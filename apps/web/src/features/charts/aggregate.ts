import type { RecordStatus, OutputType, RecordSummary } from '@alims/contracts';

export type Bucket = { key: string; label: string; count: number };

export function countByStatus(records: RecordSummary[]): Bucket[] {
  const order: RecordStatus[] = [
    'draft',
    'submitted',
    'in_review',
    'returned_for_revision',
    'resubmitted',
    'institutionally_verified',
    'published',
    'superseded',
    'withdrawn',
    'under_dispute',
    'verification_revoked',
  ];
  const counts = new Map<string, number>();
  for (const status of order) counts.set(status, 0);
  for (const rec of records) {
    counts.set(rec.status, (counts.get(rec.status) ?? 0) + 1);
  }
  return order.map((key) => ({
    key,
    label: key.replaceAll('_', ' '),
    count: counts.get(key) ?? 0,
  }));
}

export function countByType(records: RecordSummary[]): Bucket[] {
  const counts = new Map<OutputType, number>();
  for (const rec of records) {
    counts.set(rec.outputType, (counts.get(rec.outputType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key.replaceAll('_', ' '), count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
