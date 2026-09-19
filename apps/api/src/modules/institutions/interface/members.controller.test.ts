import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { Member } from '@alims/contracts';
import { InstitutionsModule } from '../institutions.module';
import { MembershipService } from '../application/membership.service';
import { InstitutionService } from '../application/institution.service';
import { AuditModule } from '../../../infrastructure/audit/audit.module';
import { PolicyModule } from '../../../domain/policy/policy.module';
import { TenantModule } from '../../../interface/middleware/tenant.module';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { EmailModule } from '../../../infrastructure/email/email.module';
import { EmailService } from '../../../infrastructure/email/email.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ProblemDetailsFilter } from '../../../interface/filters/problem-details.filter';
import { PolicyGuard } from '../../../interface/guards/policy.guard';

/**
 * HTTP surface of the members endpoints (api_specification.md §4 "Members"):
 * route shapes, zod validation, and the step-up requirement on role/status
 * changes. Persistence, RLS and capability enforcement are proven by the
 * integration suite against real PostgreSQL and by the live journey.
 */

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

const member: Member = {
  id: MEMBER_ID,
  userId: '33333333-3333-4333-8333-333333333333',
  email: 'librarian@jcu.edu',
  displayName: 'librarian',
  role: 'librarian',
  status: 'active',
  departmentId: null,
  programmeId: null,
  createdAt: '2026-09-18T00:00:00.000Z',
};

describe('Members HTTP API (api_specification.md §4)', () => {
  let app: INestApplication;
  let list: ReturnType<typeof vi.fn>;
  let add: ReturnType<typeof vi.fn>;
  let bulkInvite: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let revoke: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    list = vi.fn(async () => ({ items: [member], nextCursor: null, hasMore: false }));
    add = vi.fn(async () => ({ ...member }));
    bulkInvite = vi.fn(async () => ({
      invitations: [{ email: member.email, outcome: 'invited', member }],
    }));
    update = vi.fn(async () => ({ ...member, role: 'examiner' as const }));
    revoke = vi.fn(async () => undefined);

    // The real ConfigModule (global, exactly as the app registers it) so
    // every service's ConfigService dependency resolves; secrets come from
    // process.env set above — nothing is ever signed or verified here.
    process.env.JWT_ACCESS_SECRET ||= 'unit-test-access-secret-0000000000000';
    process.env.REFRESH_TOKEN_SECRET ||= 'unit-test-refresh-secret-000000000000';
    process.env.MFA_ENCRYPTION_KEY ||= 'unit-test-mfa-encryption-key-00000';
    process.env.AUDIT_HASH_SALT ||= 'unit-test-audit-hash-salt-00000000000';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        InstitutionsModule,
        AuditModule,
        PolicyModule,
        TenantModule,
        PrismaModule,
        EmailModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      // No SMTP in unit tests: the honest not-configured outbox stub.
      .overrideProvider(EmailService)
      .useValue({ enqueue: vi.fn(async () => ({ outboxId: 'x', delivered: false })) })
      // Capability enforcement is PolicyGuard's job and is proven by the
      // integration suite + live journey; here it would only crash against
      // the stub Prisma, so it passes through.
      .overrideGuard(PolicyGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(InstitutionService)
      .useValue({})
      .overrideProvider(MembershipService)
      .useValue({ list, add, bulkInvite, update, revoke })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // The production error surface: RFC 9457 Problem Details (main.ts
    // registers this globally; the harness mirrors it).
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

  it('GET /institutions/:id/members returns the roster', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institutions/${INSTITUTION_ID}/members`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe('librarian@jcu.edu');
    expect(list).toHaveBeenCalledWith(INSTITUTION_ID, expect.anything());
  });

  it('GET members honours role/status/q filters', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/institutions/${INSTITUTION_ID}/members?role=librarian&status=active&q=libr`)
      .expect(200);
    expect(list).toHaveBeenLastCalledWith(
      INSTITUTION_ID,
      expect.objectContaining({ role: 'librarian', status: 'active', q: 'libr' }),
    );
  });

  it('GET members rejects an unknown role (400 ProblemDetails)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/institutions/${INSTITUTION_ID}/members?role=auditor`)
      .expect(400);
    expect(res.body.detail).toContain('Validation failed');
  });

  it('POST members adds an existing account (201)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/institutions/${INSTITUTION_ID}/members`)
      .send({ email: 'Librarian@JCU.edu', role: 'librarian' })
      .expect(201);
    expect(res.body.role).toBe('librarian');
    // Email is normalised before the service sees it.
    expect(add).toHaveBeenLastCalledWith(
      INSTITUTION_ID,
      '44444444-4444-4444-8444-444444444444',
      { email: 'librarian@jcu.edu', role: 'librarian' },
    );
  });

  it('POST members rejects a malformed email (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/institutions/${INSTITUTION_ID}/members`)
      .send({ email: 'not-an-email', role: 'librarian' })
      .expect(400);
  });

  it('POST bulk-invite returns 202 with per-item outcomes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/institutions/${INSTITUTION_ID}/members/bulk-invite`)
      .send({ invitations: [{ email: 'librarian@jcu.edu', role: 'librarian' }] })
      .expect(202);
    expect(res.body.invitations[0].outcome).toBe('invited');
  });

  it('POST bulk-invite rejects more than 500 invitations (400)', async () => {
    const invitations = Array.from({ length: 501 }, (_, i) => ({
      email: `person${i}@jcu.edu`,
      role: 'student',
    }));
    await request(app.getHttpServer())
      .post(`/api/v1/institutions/${INSTITUTION_ID}/members/bulk-invite`)
      .send({ invitations })
      .expect(400);
  });

  it('PATCH /members/:id requires a step-up assertion (403 without token)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .send({ role: 'examiner' })
      .expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('DELETE /members/:id revokes (204)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/members/${MEMBER_ID}`)
      .expect(204);
    expect(revoke).toHaveBeenCalledWith(MEMBER_ID, '44444444-4444-4444-8444-444444444444');
  });
});
