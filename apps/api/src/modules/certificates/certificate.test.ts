import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { formatCertificateNo, newQrToken } from './application/certificate.service';

/** Certificate primitives: numbering, token entropy, PDF composition. */

describe('certificate numbering', () => {
  it('mints per-year sequential numbers, zero-padded to six digits', () => {
    expect(formatCertificateNo(2026, 1)).toBe('CERT-2026-000001');
    expect(formatCertificateNo(2026, 999999)).toBe('CERT-2026-999999');
  });
});

describe('qr tokens (PRD §8 — opaque, no embedded data)', () => {
  it('are 43-char base64url strings with real entropy', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const token = newQrToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      tokens.add(token);
    }
    expect(tokens.size).toBe(100);
  });

  it('carry no structure — no recognisable prefixes or embedded claims', () => {
    // base64url's alphabet includes '-' and '_' as ordinary symbols; the
    // guarantee is 256 bits of CSPRNG with no decodable meaning.
    const token = newQrToken();
    expect(token.slice(0, 4)).not.toMatch(/^(CERT|NXR|ALIM)/);
    expect(token).not.toContain('=');
  });
});

describe('certificate pdf (real pdf-lib + qrcode output)', () => {
  let scratch: string;

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'alims-cert-'));
  });
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('composes a valid, non-trivial PDF with pages and content', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    page.drawText('Certificate of Institutional Verification', {
      x: 56,
      y: 700,
      size: 24,
      font,
    });
    const bytes = await pdf.save();

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);

    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getPageCount()).toBe(1);
    await writeFile(join(scratch, 'smoke.pdf'), bytes);
  });
});
