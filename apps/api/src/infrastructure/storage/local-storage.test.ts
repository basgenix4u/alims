import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorage } from './local-storage.service';

/**
 * Local storage adapter — part persistence, streaming assembly with digest,
 * size verification, signed access tokens and path containment.
 */
const config = {
  get: (key: string) =>
    ({
      STORAGE_ROOT: 'WILL_BE_REPLACED',
      UPLOAD_TOKEN_SECRET: 'unit-test-upload-secret-00000000000',
    })[key],
} as never;

describe('LocalStorage', () => {
  let root: string;
  let storage: LocalStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'alims-storage-'));
    (config as { get: (k: string) => string }).get = (key: string) =>
      key === 'STORAGE_ROOT' ? root : 'unit-test-upload-secret-00000000000';
    storage = new LocalStorage(config);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const body = (data: string | Buffer): Readable => Readable.from([data]);

  it('assembles parts in order and produces the correct overall sha256', async () => {
    const uploadId = '11111111-2222-4333-8444-555555555555';
    const partA = Buffer.from('a'.repeat(1024));
    const partB = Buffer.from('b'.repeat(512));
    await storage.writePart(uploadId, 2, body(partB));
    await storage.writePart(uploadId, 1, body(partA)); // out of order arrival

    const expected = createHash('sha256').update(partA).update(partB).digest('hex');
    const key = 'versions/x/object.bin';
    const sha = await storage.assemble(uploadId, key, partA.length + partB.length);
    expect(sha).toBe(expected);

    const stored = await readFile(join(root, 'objects', key));
    expect(stored.length).toBe(partA.length + partB.length);
    expect(stored.subarray(0, 1024).equals(partA)).toBe(true);
  });

  it('rejects a size mismatch and leaves no object behind', async () => {
    const uploadId = '21111111-2222-4333-8444-555555555555';
    await storage.writePart(uploadId, 1, body('short'));
    await expect(storage.assemble(uploadId, 'versions/y/object.bin', 999)).rejects.toThrow(
      'size mismatch',
    );
    await expect(readFile(join(root, 'objects', 'versions/y/object.bin'))).rejects.toThrow();
  });

  it('contains object keys inside the storage root (no traversal)', async () => {
    const uploadId = '31111111-2222-4333-8444-555555555555';
    await storage.writePart(uploadId, 1, body('x'));
    await expect(
      storage.assemble(uploadId, '../../../etc/passwd', 1),
    ).rejects.toThrow('invalid object key');
    await expect(storage.writePart('../escape', 1, body('x'))).rejects.toThrow(
      'invalid upload id',
    );
  });

  it('part tokens authorise exactly their upload+part and expire', async () => {
    const uploadId = '41111111-2222-4333-8444-555555555555';
    const signed = storage.signPartUpload('', uploadId, 3, 60);
    const token = new URL(`http://x${signed.url}`).searchParams.get('token')!;

    expect(storage.verifyPartToken(token, uploadId, 3)).toBe(true);
    expect(storage.verifyPartToken(token, uploadId, 4)).toBe(false); // wrong part
    expect(storage.verifyPartToken(token, '51111111-2222-4333-8444-555555555555', 3)).toBe(false);
    expect(storage.verifyPartToken(`${token}x`, uploadId, 3)).toBe(false); // tampered

    const stale = storage.signPartUpload('', uploadId, 3, -1);
    const staleToken = new URL(`http://x${stale.url}`).searchParams.get('token')!;
    expect(storage.verifyPartToken(staleToken, uploadId, 3)).toBe(false); // expired
  });

  it('download tokens authorise exactly their key', async () => {
    const key = 'versions/z/object.bin';
    const signed = storage.signDownload('', key, 60);
    const token = signed.url.split('/download/')[1]!.split('?')[0]!;

    expect(storage.verifyDownloadToken(decodeURIComponent(token), key)).toBe(true);
    expect(storage.verifyDownloadToken(decodeURIComponent(token), 'versions/other/object.bin')).toBe(
      false,
    );
  });

  it('openObject streams what was assembled', async () => {
    const uploadId = '61111111-2222-4333-8444-555555555555';
    const payload = 'downloadable-bytes';
    await storage.writePart(uploadId, 1, body(payload));
    await storage.assemble(uploadId, 'versions/d/object.bin', payload.length);

    const stream = await storage.openObject('versions/d/object.bin');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe(payload);

    await expect(storage.openObject('versions/missing/object.bin')).rejects.toThrow();
  });
});
