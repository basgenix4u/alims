import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Time-based one-time passwords (RFC 6238) with zero dependencies.
 *
 * SHA-1 / 6 digits / 30-second period — the de-facto authenticator-app
 * configuration (Google Authenticator, Authy, 1Password). Verification
 * tolerates one step of clock drift in either direction.
 *
 * Secrets are 20 bytes (RFC 4226 §4 RECOMMENDED), base32-encoded (RFC 4648)
 * for the otpauth URL.
 */
@Injectable()
export class TotpService {
  private readonly issuer = 'ALIMS';
  private static readonly BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  private static readonly PERIOD_SECONDS = 30;
  private static readonly DIGITS = 6;

  /** A fresh base32 secret for a new authenticator enrolment. */
  generateSecret(): string {
    return this.base32Encode(randomBytes(20));
  }

  /** The `otpauth://` URI the authenticator app scans. */
  otpauthUrl(email: string, secret: string): string {
    const label = encodeURIComponent(`${this.issuer}:${email}`);
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      algorithm: 'SHA1',
      digits: String(TotpService.DIGITS),
      period: String(TotpService.PERIOD_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** Generate the code for an explicit counter (exported for tests). */
  generateCode(secret: string, counter: number): string {
    const key = this.base32Decode(secret);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));

    const hmac = createHmac('sha1', key).update(message).digest();
    const last = hmac[hmac.length - 1] ?? 0;
    const offset = last & 0x0f;
    const binary =
      ((hmac[offset] ?? 0) << 24) |
      ((hmac[offset + 1] ?? 0) << 16) |
      ((hmac[offset + 2] ?? 0) << 8) |
      (hmac[offset + 3] ?? 0);
    const code = (binary & 0x7fffffff) % 10 ** TotpService.DIGITS;
    return String(code).padStart(TotpService.DIGITS, '0');
  }

  /**
   * Verify a code against the secret, tolerating `driftSteps` periods of
   * clock skew either side of the current one.
   */
  verify(secret: string, code: string, driftSteps = 1): boolean {
    const counter = Math.floor(Date.now() / 1000 / TotpService.PERIOD_SECONDS);
    for (let offset = -driftSteps; offset <= driftSteps; offset += 1) {
      if (this.safeEquals(this.generateCode(secret, counter + offset), code)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Human-readable single-use recovery codes (returned once at enrolment).
   * Persistence needs a schema addition — see
   * roadblocks/RB-agent_1-mfa-recovery-code-storage.md.
   */
  generateRecoveryCodes(count = 8): string[] {
    return Array.from({ length: count }, () =>
      randomBytes(10)
        .toString('hex')
        .toUpperCase()
        .replace(/(.{5})(?=.)/g, '$1-'),
    );
  }

  private safeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }

  private base32Encode(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += TotpService.BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
        bits -= 5;
      }
    }
    if (bits > 0) {
      out += TotpService.BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }
    return out;
  }

  private base32Decode(input: string): Buffer {
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const char of input.toUpperCase()) {
      const index = TotpService.BASE32_ALPHABET.indexOf(char);
      if (index === -1) {
        continue;
      }
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }
}
