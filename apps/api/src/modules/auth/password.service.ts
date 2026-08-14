import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing (PRD §9.1, OWASP A02/A07).
 *
 * Argon2id parameters follow the OWASP Password Storage Cheat Sheet minimum:
 * 19 MiB memory, 2 iterations, parallelism 1. Argon2id is memory-hard, which
 * blunts GPU and ASIC cracking in a way PBKDF2 and bcrypt do not.
 */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * A real Argon2id hash of a random string, used as a decoy.
 *
 * When an unknown email is submitted we still perform a verification against
 * this hash. Without it, "unknown email" would return measurably faster than
 * "wrong password", letting an attacker enumerate accounts with a stopwatch
 * (api_specification.md §3: identical shape *and* latency).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$5cW4dBSchCYKpUKj+ex8XA$5sevUL2dOCQ3R4qzwovkqO6Rl9TU1GQK2yrfpvg2/00';

@Injectable()
export class PasswordService {
  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Verify a password. Never throws on malformed input — a corrupt stored
   * hash must read as "wrong password", not as a 500 that reveals internals.
   */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }

  /**
   * Burn the same work as a real verification so timing cannot distinguish a
   * non-existent account from a wrong password.
   */
  async wasteTime(plaintext: string): Promise<void> {
    try {
      await argon2.verify(DUMMY_HASH, plaintext);
    } catch {
      // Expected: the decoy never matches. Swallow so timing stays uniform.
    }
  }

  /** True when the stored hash predates the current cost parameters. */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }
}
