import { describe, expect, it } from 'vitest';
import { TotpService } from './totp.service';

const totp = new TotpService();

// RFC 6238 Appendix B — 20-byte ASCII secret "12345678901234567890",
// base32-encoded (RFC 4648). SHA-1, 6 digits, 30s period.
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TotpService — RFC 6238 test vectors', () => {
  const vectors: Array<{ time: number; counter: number; code: string }> = [
    { time: 59, counter: 1, code: '287082' },
    { time: 1111111109, counter: 37037036, code: '081804' },
    { time: 1111111111, counter: 37037037, code: '050471' },
    { time: 1234567890, counter: 41152263, code: '005924' },
    { time: 2000000000, counter: 66666666, code: '279037' },
  ];

  for (const { time, counter, code } of vectors) {
    it(`matches RFC 6238 at T=${time}`, () => {
      expect(totp.generateCode(RFC_SECRET_BASE32, counter)).toBe(code);
    });
  }

  it('pads codes with leading zeros', () => {
    expect(totp.generateCode(RFC_SECRET_BASE32, 41152263)).toBe('005924');
  });
});

describe('TotpService — generation and verification', () => {
  it('generates a 32-character base32 secret', () => {
    const secret = totp.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('builds a scanable otpauth URL', () => {
    const url = totp.otpauthUrl('a@b.test', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(url).toContain('otpauth://totp/ALIMS%3Aa%40b.test');
    expect(url).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(url).toContain('issuer=ALIMS');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });

  it('accepts the current, previous and next time step (clock drift)', () => {
    const secret = totp.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    expect(totp.verify(secret, totp.generateCode(secret, counter))).toBe(true);
    expect(totp.verify(secret, totp.generateCode(secret, counter - 1))).toBe(true);
    expect(totp.verify(secret, totp.generateCode(secret, counter + 1))).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = totp.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const wrong = totp.generateCode(secret, counter) === '000000' ? '000001' : '000000';
    expect(totp.verify(secret, wrong)).toBe(false);
  });

  it('rejects a code outside the drift window', () => {
    const secret = totp.generateSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const stale = totp.generateCode(secret, counter - 5);
    expect(totp.verify(secret, stale)).toBe(false);
  });

  it('generates distinct, formatted recovery codes', () => {
    const codes = totp.generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}-[A-F0-9]{5}$/);
    }
  });
});
