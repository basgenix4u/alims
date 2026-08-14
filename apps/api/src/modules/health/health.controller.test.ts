import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('Health endpoints (smoke test)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /api/v1/health returns 200 and status ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeTruthy();
  });

  it('GET /api/v1/health/ready reports dependency checks', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('redis');
    expect(res.body.checks).toHaveProperty('storage');
  });

  it('does not leak internal system details (PRD §9.1)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const body = JSON.stringify(res.body).toLowerCase();
    for (const leak of ['password', 'secret', 'token', 'databaseurl', '/home/', 'stack']) {
      expect(body).not.toContain(leak);
    }
  });
});
