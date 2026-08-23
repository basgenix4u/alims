import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RecordsModule } from '../records.module';

const validBody = {
  outputType: 'thesis',
  title: 'A Study of Soil Degradation in Northern Nigeria',
  disciplines: ['Agriculture'],
  keywords: ['soil', 'degradation'],
  accessLevel: 'metadata_public',
  licence: 'CC-BY-4.0',
};

describe('Records HTTP API (api_specification.md §5)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RecordsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('POST /api/v1/records creates a draft (201)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/records').send(validBody).expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.title).toBe(validBody.title);
    expect(res.body.id).toBeTruthy();
  });

  it('GET /api/v1/records/schema returns field metadata', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/records/schema').expect(200);
    const fields = res.body.fields;
    expect(Array.isArray(fields)).toBe(true);
    const title = fields.find((f: { field: string }) => f.field === 'title');
    expect(title.required).toBe('always');
    expect(title.helpText.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/records/:id returns the record', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/records').send(validBody).expect(201);
    const res = await request(app.getHttpServer()).get(`/api/v1/records/${created.body.id}`).expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('PATCH /api/v1/records/:id updates a draft', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/records').send(validBody).expect(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/records/${created.body.id}`)
      .send({ abstract: 'a'.repeat(100) })
      .expect(200);
    expect(res.body.abstract!.length).toBe(100);
  });

  it('POST /api/v1/records/:id/submit returns 422 when incomplete', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/records').send(validBody).expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/records/${created.body.id}/submit`)
      .expect(422);
    // RFC 9457: machine code surfaced via `title`; per-field codes in errors[].
    expect(res.body.title).toBe('SUBMISSION_INCOMPLETE');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors[0].code).toBe('ABSTRACT_REQUIRED');
  });

  it('returns 404 for an unknown record', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/records/00000000-0000-0000-0000-000000000001')
      .expect(404);
  });
});
