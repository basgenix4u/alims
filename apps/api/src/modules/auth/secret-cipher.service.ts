import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/**
 * AES-256-GCM encryption for secrets at rest (T-101).
 *
 * TOTP seeds are credentials: a database disclosure must not yield working
 * authenticator seeds (PRD §9.1). The 256-bit key is derived from
 * `MFA_ENCRYPTION_KEY`; each encryption uses a fresh 12-byte IV and stores
 * its GCM authentication tag, so tampering is detected on decrypt.
 *
 * Layout: base64( iv[12] ‖ tag[16] ‖ ciphertext ).
 */
@Injectable()
export class SecretCipherService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = createHash('sha256').update(config.get('MFA_ENCRYPTION_KEY')).digest();
  }

  encryptSecret(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  /** Decrypt, or return null when the payload is malformed or tampered with. */
  tryDecrypt(payload: string): string | null {
    try {
      const raw = Buffer.from(payload, 'base64');
      if (raw.length < 28) {
        return null;
      }
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
