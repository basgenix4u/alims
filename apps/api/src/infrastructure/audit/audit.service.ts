import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Env } from '../../config/env';
import { PrismaService } from '../database/prisma.service';

/**
 * Audit actions. A closed union rather than free strings so a typo cannot
 * silently create an unqueryable action name.
 */
export type AuditAction =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.locked'
  | 'auth.logout'
  | 'auth.refresh.success'
  | 'auth.refresh.reuse_detected'
  | 'auth.password.reset_requested'
  | 'auth.password.reset_completed'
  | 'auth.mfa.enrolled'
  | 'auth.mfa.verified'
  | 'auth.step_up.granted'
  | 'policy.denied';

export interface AuditInput {
  action: AuditAction;
  subjectType: string;
  subjectId?: string | null;
  actorUserId?: string | null;
  institutionId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Keys never written to the audit log in clear text (PRD §9.1 — PII redacted
 * from payloads). Matching is case-insensitive and substring-based so
 * `newPassword` and `password_confirmation` are both caught.
 */
const REDACTED_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'otp',
  'totp',
  'recoverycode',
  'apikey',
  'credential',
  'ssn',
  'legalname',
];

const REDACTED = '[redacted]';
const MAX_PAYLOAD_DEPTH = 4;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly salt: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.salt = config.get('AUDIT_HASH_SALT');
  }

  /**
   * Append an audit event.
   *
   * `prev_hash` and `hash` are set by the database trigger, so the chain is
   * sealed even if a future caller bypasses this service. We pass a
   * placeholder for `hash` because the column is NOT NULL and the BEFORE
   * INSERT trigger overwrites it.
   */
  async record(input: AuditInput, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? this.prisma;
    try {
      await db.auditEvent.create({
        data: {
          action: input.action,
          subjectType: input.subjectType,
          subjectId: input.subjectId ?? null,
          actorUserId: input.actorUserId ?? null,
          institutionId: input.institutionId ?? null,
          payload: this.redact(input.payload ?? {}) as Prisma.InputJsonValue,
          ipHash: this.hashIdentifier(input.ip),
          userAgentHash: this.hashIdentifier(input.userAgent),
          hash: '', // replaced by trg_audit_event_chain
        },
      });
    } catch (error) {
      // Never let auditing break the user-facing request. A dropped audit row
      // is logged loudly for the operator instead.
      this.logger.error(
        `Failed to write audit event '${input.action}': ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Salted SHA-256 of an IP address or user agent.
   *
   * Storing the raw value would make the audit log itself a PII store. The
   * hash still supports "same origin?" correlation during an investigation.
   */
  hashIdentifier(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    return createHash('sha256').update(`${this.salt}:${value}`).digest('hex');
  }

  /** Recursively strip sensitive keys and cap depth to bound the payload. */
  private redact(value: unknown, depth = 0): unknown {
    if (depth >= MAX_PAYLOAD_DEPTH) {
      return '[truncated]';
    }
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => this.redact(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key] = this.isSensitive(key) ? REDACTED : this.redact(item, depth + 1);
      }
      return out;
    }
    return value;
  }

  private isSensitive(key: string): boolean {
    const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
    return REDACTED_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
  }

  /**
   * Verify the hash chain via the database function.
   * Returns the first broken link, or null when the chain is intact.
   */
  async verifyChain(): Promise<{
    brokenSeq: bigint;
    expectedHash: string;
    actualHash: string;
  } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ broken_seq: bigint; expected_hash: string; actual_hash: string }>
    >`SELECT * FROM verify_audit_chain()`;

    const first = rows[0];
    if (!first) {
      return null;
    }
    return {
      brokenSeq: first.broken_seq,
      expectedHash: first.expected_hash,
      actualHash: first.actual_hash,
    };
  }
}
