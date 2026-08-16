import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env';
import type { PrismaService } from '../database/prisma.service';
import { AuditService } from './audit.service';

const SALT = 'audit-test-salt-that-is-long-enough-00000';

interface CapturedCreate {
  data: Record<string, unknown>;
}

function makeService(): { service: AuditService; created: CapturedCreate[] } {
  const created: CapturedCreate[] = [];
  const prisma = {
    auditEvent: {
      create: vi.fn(async (args: CapturedCreate) => {
        created.push(args);
        return args;
      }),
    },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => (key === 'AUDIT_HASH_SALT' ? SALT : undefined),
  } as unknown as ConfigService<Env, true>;

  return { service: new AuditService(prisma, config), created };
}

describe('AuditService — PII redaction (PRD §9.1)', () => {
  it('redacts sensitive keys from the payload', async () => {
    const { service, created } = makeService();

    await service.record({
      action: 'auth.login.failure',
      subjectType: 'user_account',
      payload: {
        email: 'user@example.com',
        password: 'super-secret-value',
        totpCode: '123456',
        apiKey: 'ak_live_123',
        attempts: 3,
      },
    });

    const payload = created[0]?.data.payload as Record<string, unknown>;
    expect(payload.password).toBe('[redacted]');
    expect(payload.totpCode).toBe('[redacted]');
    expect(payload.apiKey).toBe('[redacted]');
    // Non-sensitive operational fields survive — the log must stay useful.
    expect(payload.attempts).toBe(3);
    expect(payload.email).toBe('user@example.com');
  });

  it('redacts case- and separator-insensitively', async () => {
    const { service, created } = makeService();

    await service.record({
      action: 'auth.password.reset_completed',
      subjectType: 'user_account',
      payload: {
        NewPassword: 'x',
        password_confirmation: 'y',
        'refresh-token': 'z',
        RECOVERYCODE: 'w',
        legalName: 'Jane Doe',
      },
    });

    const payload = created[0]?.data.payload as Record<string, unknown>;
    expect(payload.NewPassword).toBe('[redacted]');
    expect(payload.password_confirmation).toBe('[redacted]');
    expect(payload['refresh-token']).toBe('[redacted]');
    expect(payload.RECOVERYCODE).toBe('[redacted]');
    expect(payload.legalName).toBe('[redacted]');
  });

  it('redacts inside nested objects and arrays', async () => {
    const { service, created } = makeService();

    await service.record({
      action: 'auth.login.failure',
      subjectType: 'user_account',
      payload: { context: { nested: { secret: 'hide-me', keep: 'visible' } } },
    });

    const payload = created[0]?.data.payload as {
      context: { nested: { secret: string; keep: string } };
    };
    expect(payload.context.nested.secret).toBe('[redacted]');
    expect(payload.context.nested.keep).toBe('visible');
  });

  it('truncates payloads deeper than the depth cap', async () => {
    const { service, created } = makeService();

    await service.record({
      action: 'auth.login.failure',
      subjectType: 'user_account',
      payload: { a: { b: { c: { d: { e: 'too deep' } } } } },
    });

    // Bounded so a hostile input cannot bloat the audit table.
    expect(JSON.stringify(created[0]?.data.payload)).toContain('[truncated]');
  });
});

describe('AuditService — identifier hashing', () => {
  it('hashes IP addresses rather than storing them raw', async () => {
    const { service, created } = makeService();

    await service.record({
      action: 'auth.login.success',
      subjectType: 'user_account',
      ip: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
    });

    const data = created[0]?.data as { ipHash: string; userAgentHash: string };
    expect(data.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.ipHash).not.toContain('203.0.113.42');
    expect(data.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes deterministically so investigators can correlate', () => {
    const { service } = makeService();
    expect(service.hashIdentifier('203.0.113.42')).toBe(service.hashIdentifier('203.0.113.42'));
    expect(service.hashIdentifier('203.0.113.42')).not.toBe(service.hashIdentifier('203.0.113.43'));
  });

  it('returns null for absent identifiers', () => {
    const { service } = makeService();
    expect(service.hashIdentifier(null)).toBeNull();
    expect(service.hashIdentifier(undefined)).toBeNull();
    expect(service.hashIdentifier('')).toBeNull();
  });
});

describe('AuditService — resilience', () => {
  it('never propagates a database failure to the caller', async () => {
    const prisma = {
      auditEvent: { create: vi.fn(async () => Promise.reject(new Error('db down'))) },
    } as unknown as PrismaService;
    const config = {
      get: () => SALT,
    } as unknown as ConfigService<Env, true>;
    const service = new AuditService(prisma, config);

    // A failed audit write must not turn a successful login into a 500.
    await expect(
      service.record({ action: 'auth.login.success', subjectType: 'user_account' }),
    ).resolves.toBeUndefined();
  });

  it('leaves hash and prev_hash to the database trigger', async () => {
    const { service, created } = makeService();
    await service.record({ action: 'auth.logout', subjectType: 'refresh_token' });

    // The BEFORE INSERT trigger computes the real chain values.
    expect(created[0]?.data.hash).toBe('');
    expect(created[0]?.data).not.toHaveProperty('prevHash');
  });
});
