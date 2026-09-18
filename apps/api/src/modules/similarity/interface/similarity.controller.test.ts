import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from '../../../interface/filters/problem-details.filter';
import { SIMILARITY_ADVISORY_NOTICE, type SimilarityAssessment } from '@alims/contracts';
import { SimilarityModule } from '../similarity.module';
import { SimilarityService } from '../application/similarity.service';

/**
 * HTTP surface of the similarity endpoints (api_specification.md §7):
 * route shapes, the advisory notice contract, and zod validation of the
 * human review decision. Persistence, RLS and the no-status-write
 * invariant are proven by the integration suite against real PostgreSQL.
 */

const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

const assessment: SimilarityAssessment = {
  id: '33333333-3333-4333-8333-333333333333',
  versionId: VERSION_ID,
  status: 'not_requested',
  score: null,
  reportUrl: null,
  provider: 'none',
  advisoryNotice: SIMILARITY_ADVISORY_NOTICE,
  requestedAt: null,
  completedAt: null,
};

describe('Similarity HTTP API (api_specification.md §7)', () => {
  let app: INestApplication;
  let getAssessment: ReturnType<typeof vi.fn>;
  let reviewAssessment: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    getAssessment = vi.fn(async () => ({ ...assessment }));
    reviewAssessment = vi.fn(async () => ({ ...assessment, status: 'reviewed' as const }));

    const moduleRef = await Test.createTestingModule({
      imports: [SimilarityModule],
    })
      .overrideProvider(SimilarityService)
      .useValue({ getAssessment, reviewAssessment })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // The production error surface: RFC 9457 Problem Details (bootstrap
    // registers this globally in main.ts; the harness mirrors it).
    app.useGlobalFilters(new ProblemDetailsFilter());
    // The global JwtAuthGuard lives in AppModule, which this test does not
    // import; stand in for it so @CurrentUser() resolves a fixed principal.
    app.use((req, _res, next) => {
      req.user = { userId: '44444444-4444-4444-8444-444444444444', sessionId: null };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /records/:id/versions/:v/similarity returns the assessment with the advisory notice', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/records/${RECORD_ID}/versions/${VERSION_ID}/similarity`)
      .expect(200);
    expect(res.body.versionId).toBe(VERSION_ID);
    expect(res.body.advisoryNotice).toBe('Review signal only. Not a finding of misconduct.');
    expect(getAssessment).toHaveBeenCalledWith(RECORD_ID, VERSION_ID, '44444444-4444-4444-8444-444444444444');
  });

  it('POST .../similarity/review records the human decision', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/records/${RECORD_ID}/versions/${VERSION_ID}/similarity/review`)
      .send({ outcome: 'no_issue', reason: 'Overlap is fully cited in chapter two.' })
      .expect(200);
    expect(res.body.status).toBe('reviewed');
    expect(reviewAssessment).toHaveBeenCalledWith(
      RECORD_ID,
      VERSION_ID,
      '44444444-4444-4444-8444-444444444444',
      { outcome: 'no_issue', reason: 'Overlap is fully cited in chapter two.' },
    );
  });

  // Field-level zod failures surface as the system-wide 400 ProblemDetails
  // (ZodValidationPipe → BadRequestException → ProblemDetailsFilter); the
  // 422 space is reserved for submission preconditions (api_spec §5).
  it('rejects a reason shorter than 10 characters', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/records/${RECORD_ID}/versions/${VERSION_ID}/similarity/review`)
      .send({ outcome: 'no_issue', reason: 'short' })
      .expect(400);
    expect(res.body.detail).toContain('Validation failed');
    expect(reviewAssessment).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown outcome', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/records/${RECORD_ID}/versions/${VERSION_ID}/similarity/review`)
      .send({ outcome: 'plagiarism_confirmed', reason: 'This must not exist as an outcome.' })
      .expect(400);
    expect(res.body.detail).toContain('Validation failed');
    expect(reviewAssessment).toHaveBeenCalledTimes(1);
  });
});
