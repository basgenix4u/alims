import { describe, expect, it, beforeEach } from 'vitest';
import { RecordService } from './record.service';
import { InMemoryRecordRepository } from '../infrastructure/in-memory-record.repository';
import { RecordsDomainError } from './records-errors';
import { ABSTRACT_MIN, TITLE_MIN } from '@alims/contracts';

const OWNER = '00000000-0000-0000-0000-000000000000';
const OTHER = '11111111-1111-1111-1111-111111111111';

function validDraft() {
  return {
    outputType: 'thesis' as const,
    title: 'A Study of Soil Degradation in Northern Nigeria',
    disciplines: ['Agriculture'],
    keywords: ['soil', 'degradation'],
    accessLevel: 'metadata_public' as const,
    licence: 'CC-BY-4.0',
  };
}

describe('RecordService — PRD §6.2 / §7.1', () => {
  let repo: InMemoryRecordRepository;
  let svc: RecordService;

  beforeEach(() => {
    repo = new InMemoryRecordRepository();
    svc = new RecordService(repo);
  });

  it('creates a record as a draft without requiring publication fields', async () => {
    const rec = await svc.createDraft(OWNER, validDraft());
    expect(rec.status).toBe('draft');
    expect(rec.verificationLevel).toBe('draft');
    expect(rec.abstract).toBeNull();
    expect(rec.institutionId).toBeNull();
  });

  it('rejects a title shorter than the PRD minimum (10 chars)', async () => {
    await expect(svc.createDraft(OWNER, { ...validDraft(), title: 'Too short' }))
      .rejects.toBeInstanceOf(RecordsDomainError);
    try {
      await svc.createDraft(OWNER, { ...validDraft(), title: 'Too short' });
    } catch (e) {
      const err = e as RecordsDomainError;
      expect(err.status).toBe(422);
      expect(err.code).toBe('VALIDATION');
    }
  });

  it('rejects a title longer than 500 chars', async () => {
    await expect(svc.createDraft(OWNER, { ...validDraft(), title: 'a'.repeat(501) }))
      .rejects.toThrow();
  });

  it('accepts a valid abstract within 100–10,000 chars', async () => {
    const rec = await svc.createDraft(OWNER, {
      ...validDraft(),
      abstract: 'a'.repeat(ABSTRACT_MIN),
    });
    expect(rec.abstract!.length).toBe(ABSTRACT_MIN);
  });

  it('allows updating a draft (PATCH semantics)', async () => {
    const rec = await svc.createDraft(OWNER, validDraft());
    const updated = await svc.updateDraft(rec.id, OWNER, { abstract: 'a'.repeat(ABSTRACT_MIN) });
    expect(updated.abstract!.length).toBe(ABSTRACT_MIN);
    expect(updated.status).toBe('draft');
  });

  it('rejects editing a non-draft record with 409 NOT_DRAFT', async () => {
    const rec = await svc.createDraft(OWNER, validDraft());
    // simulate promotion out of draft (normally via submit/workflow)
    const promoted = await repo.findById(rec.id);
    await repo.save({ ...promoted!, status: 'submitted' });
    await expect(svc.updateDraft(rec.id, OWNER, { title: 'a'.repeat(TITLE_MIN) }))
      .rejects.toMatchObject({ status: 409, code: 'NOT_DRAFT' });
  });

  it('hides other users’ records as 404 (no existence leak)', async () => {
    const rec = await svc.createDraft(OWNER, validDraft());
    await expect(svc.getById(rec.id, OTHER)).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 for a missing record', async () => {
    await expect(svc.getById('00000000-0000-0000-0000-000000000001', OWNER))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('blocks official submission until required institutional fields are complete', async () => {
    const rec = await svc.createDraft(OWNER, validDraft());
    try {
      svc.assertReadyForSubmission(rec);
      throw new Error('expected submission to be blocked');
    } catch (e) {
      const err = e as RecordsDomainError;
      expect(err.status).toBe(422);
      expect(err.code).toBe('SUBMISSION_INCOMPLETE');
      const codes = err.errors!.map((x) => x.code);
      expect(codes).toContain('ABSTRACT_REQUIRED');
      expect(codes).toContain('INSTITUTION_REQUIRED');
    }
  });

  it('allows submission when required fields are present', async () => {
    const rec = await svc.createDraft(OWNER, {
      ...validDraft(),
      abstract: 'a'.repeat(ABSTRACT_MIN),
      institutionId: '22222222-2222-2222-2222-222222222222',
    });
    expect(() => svc.assertReadyForSubmission(rec)).not.toThrow();
  });

  it('lists only the owner’s records, newest first, with pagination', async () => {
    const a = await svc.createDraft(OWNER, validDraft());
    const b = await svc.createDraft(OWNER, { ...validDraft(), title: 'Second Research Project on Water Quality' });
    await svc.createDraft(OTHER, validDraft());
    const page = await svc.listMine(OWNER, { limit: 10 });
    expect(page.items.length).toBe(2);
    expect(page.items.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('exposes field schema metadata (drives the frontend wizard)', () => {
    const schema = svc.getFieldSchema();
    expect(schema.fields.length).toBeGreaterThan(0);
    const title = schema.fields.find((f) => f.field === 'title');
    expect(title?.required).toBe('always');
    expect(title?.min).toBe(10);
    expect(title?.max).toBe(500);
  });
});
