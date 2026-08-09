import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { SecretCipherService } from './secret-cipher.service';

const cipher = new SecretCipherService({
  get: (key: string) => ({ MFA_ENCRYPTION_KEY: 'test-mfa-encryption-key-that-is-long-enough' }[key]),
} as unknown as ConfigService<Env, true>);

describe('SecretCipherService — AES-256-GCM secret at rest', () => {
  it('round-trips a plaintext secret', () => {
    const encrypted = cipher.encryptSecret('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cipher.tryDecrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces distinct ciphertexts for the same plaintext (fresh IV)', () => {
    const a = cipher.encryptSecret('same-secret');
    const b = cipher.encryptSecret('same-secret');
    expect(a).not.toBe(b);
    expect(cipher.tryDecrypt(a)).toBe('same-secret');
    expect(cipher.tryDecrypt(b)).toBe('same-secret');
  });

  it('returns null for a tampered payload', () => {
    const encrypted = cipher.encryptSecret('tamper-me');
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff; // flip the last ciphertext bit
    expect(cipher.tryDecrypt(raw.toString('base64'))).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(cipher.tryDecrypt('not-base64-@@@')).toBeNull();
    expect(cipher.tryDecrypt('')).toBeNull();
  });
});
