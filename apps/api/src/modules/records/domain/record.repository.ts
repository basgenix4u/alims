import type { ResearchRecord } from './record.entity';

/**
 * Persistence port for ResearchRecord.
 *
 * The application layer depends only on this interface, so persistence can be
 * swapped between an in-memory implementation (tests/dev) and a Prisma-backed
 * one (production) with zero changes to service logic. PRD §6.3 append-only
 * immutability is enforced at the DB layer (T-201) — this port stays minimal.
 */
export interface RecordRepository {
  create(record: ResearchRecord): Promise<ResearchRecord>;
  save(record: ResearchRecord): Promise<ResearchRecord>;
  findById(id: string): Promise<ResearchRecord | null>;
  findByIds(ids: string[]): Promise<ResearchRecord[]>;
  /** List owned records, newest first. */
  listByOwner(
    ownerUserId: string,
    params: { limit: number; cursor?: string | null },
  ): Promise<{ items: ResearchRecord[]; nextCursor: string | null; hasMore: boolean }>;
}

export const RECORD_REPOSITORY = Symbol('RECORD_REPOSITORY');
