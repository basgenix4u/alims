import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces an Argon2id hash, never the plaintext', async () => {
    const plaintext = 'correct horse battery staple';
    const hash = await service.hash(plaintext);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(plaintext);
  });

  it('encodes the OWASP-recommended cost parameters', async () => {
    const hash = await service.hash('another-strong-password-123');
    // m=19456 KiB (19 MiB), t=2 iterations, p=1 lane.
    expect(hash).toContain('m=19456,t=2,p=1');
  });

  it('salts each hash, so identical passwords differ at rest', async () => {
    const a = await service.hash('identical-password-value');
    const b = await service.hash('identical-password-value');
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash('the-right-password-9');
    await expect(service.verify(hash, 'the-right-password-9')).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('the-right-password-9');
    await expect(service.verify(hash, 'the-wrong-password-9')).resolves.toBe(false);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    // A corrupt row must read as "wrong password", not crash into a 500.
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(service.verify('', 'anything')).resolves.toBe(false);
  });

  it('wasteTime resolves without throwing (timing-attack defence)', async () => {
    await expect(service.wasteTime('some-password')).resolves.toBeUndefined();
  });

  it('spends comparable time on a real verify and on the decoy', async () => {
    const hash = await service.hash('timing-test-password');

    const realStart = process.hrtime.bigint();
    await service.verify(hash, 'wrong-password-here');
    const realNs = Number(process.hrtime.bigint() - realStart);

    const decoyStart = process.hrtime.bigint();
    await service.wasteTime('wrong-password-here');
    const decoyNs = Number(process.hrtime.bigint() - decoyStart);

    // Both run the same Argon2 parameters, so neither should be an order of
    // magnitude faster. Generous bound: CI timing is noisy.
    const ratio = Math.max(realNs, decoyNs) / Math.min(realNs, decoyNs);
    expect(ratio).toBeLessThan(5);
  });

  it('does not request a rehash for a freshly created hash', async () => {
    const hash = await service.hash('freshly-hashed-password');
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('requests a rehash for a weaker legacy hash', () => {
    const weak = '$argon2id$v=19$m=4096,t=1,p=1$c29tZXNhbHQ$aGFzaA';
    expect(service.needsRehash(weak)).toBe(true);
  });
});
