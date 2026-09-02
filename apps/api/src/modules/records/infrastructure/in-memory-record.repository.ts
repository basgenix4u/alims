import { Injectable } from '@nestjs/common';
import { ResearchRecord } from '../domain/record.entity';
import { RecordRepository } from '../domain/record.repository';

/**
 * In-memory RecordRepository.
 *
 * Used for tests and the no-DB dev loop (RB-001: no Docker in sandbox). The
 * production implementation swaps to a Prisma-backed repository in T-201
 * (append-only versioning) which reuses the same `RecordRepository` port, so
 * the application layer is unaffected.
 */
@Injectable()
export class InMemoryRecordRepository implements RecordRepository {
  private readonly store = new Map<string, ResearchRecord>();

  async create(record: ResearchRecord): Promise<ResearchRecord> {
    this.store.set(record.id, { ...record });
    return record;
  }

  async save(record: ResearchRecord): Promise<ResearchRecord> {
    this.store.set(record.id, { ...record });
    return record;
  }

  async findById(id: string): Promise<ResearchRecord | null> {
    const r = this.store.get(id);
    return r ? { ...r } : null;
  }

  async findByIds(ids: string[]): Promise<ResearchRecord[]> {
    return ids
      .map((id) => this.store.get(id))
      .filter((r): r is ResearchRecord => Boolean(r))
      .map((r) => ({ ...r }));
  }

  async listByOwner(
    ownerUserId: string,
    params: { limit: number; cursor?: string | null },
  ): Promise<{
    items: ResearchRecord[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const owned = [...this.store.values()]
      .filter((r) => r.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Cursor is the `updatedAt` timestamp of the last item seen (simple, deterministic).
    const start = params.cursor ? owned.findIndex((r) => r.updatedAt === params.cursor) + 1 : 0;
    const items = owned.slice(start, start + params.limit);
    const hasMore = start + params.limit < owned.length;
    const nextCursor = hasMore ? items[items.length - 1]?.updatedAt ?? null : null;
    return { items: items.map((r) => ({ ...r })), nextCursor, hasMore };
  }
}
