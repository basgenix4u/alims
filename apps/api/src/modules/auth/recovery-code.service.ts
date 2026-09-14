import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TotpService } from './totp.service';

/**
 * Single-use MFA recovery codes (api_specification.md §3).
 *
 * Storage: only a keyed hash (HMAC-SHA-256, pepper derived from
 * MFA_ENCRYPTION_KEY) is persisted. A database disclosure yields hashes, not
 * working codes — the same at-rest posture as the TOTP secret itself.
 *
 * Codes are high-entropy random values, so a per-code salt is unnecessary;
 * the keyed hash prevents rainbow-style precomputation against the known
 * code format. Comparison is constant-time over the fixed-length digests.
 */
@Injectable()
export class RecoveryCodeService {
  private readonly pepper: Buffer;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
  ) {
    this.pepper = createHash('sha256').update(config.get('MFA_ENCRYPTION_KEY')).digest();
  }

  /** Normalise a code to its canonical form (uppercase, dashes removed). */
  private normalise(code: string): string {
    return code.trim().toUpperCase().replace(/[-\s]/g, '');
  }

  /** Keyed hash of a normalised recovery code, hex-encoded (64 chars). */
  hash(code: string): string {
    return createHmac('sha256', this.pepper).update(this.normalise(code)).digest('hex');
  }

  /**
   * Generate `count` fresh codes for a user, persist their hashes, and return
   * the plaintexts exactly once. Any previous unconsumed codes are revoked so
   * re-enrolment cannot leave two live sets.
   */
  async generateAndStore(userId: string, count = 8): Promise<string[]> {
    const codes = this.totp.generateRecoveryCodes(count);
    await this.prisma.withTenant({ institutionId: null, userId }, async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId, usedAt: null } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({ userId, codeHash: this.hash(code) })),
      });
    });
    return codes;
  }

  /**
   * Try `code` against the user's unconsumed codes. On a match the code is
   * consumed atomically and true is returned; otherwise false — the caller
   * decides how to respond. Runs under the user's own tenant context, so
   * row-level security also fences the rows.
   */
  async verifyAndConsume(userId: string, code: string): Promise<boolean> {
    const candidate = Buffer.from(this.hash(code), 'hex');
    return this.prisma.withTenant({ institutionId: null, userId }, async (tx) => {
      const rows = await tx.mfaRecoveryCode.findMany({
        where: { userId, usedAt: null },
        select: { id: true, codeHash: true },
      });
      for (const row of rows) {
        const stored = Buffer.from(row.codeHash, 'hex');
        if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
          const consumed = await tx.mfaRecoveryCode.updateMany({
            where: { id: row.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          // updateMany guards the consume: 0 means a concurrent request
          // already spent it — which must fail closed.
          return consumed.count === 1;
        }
      }
      return false;
    });
  }
}
