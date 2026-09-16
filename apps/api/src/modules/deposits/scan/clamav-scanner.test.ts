import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClamavScanner, NoScanner } from './scanner.service';
import { LocalStorage } from '../../../infrastructure/storage/local-storage.service';

/**
 * ClamAV adapter — exercised against a real TCP server speaking the clamd
 * INSTREAM protocol, so the wire format is proven, not mocked away.
 */

const storageConfig = { get: (key: string) => (key === 'STORAGE_ROOT' ? 'unset' : 't'.repeat(40)) } as never;

describe('ClamavScanner (real clamd protocol over TCP)', () => {
  let server: Server;
  let port = 0;
  let storage: LocalStorage;
  let root: string;
  /** What the fake clamd answers once the stream terminates. */
  let answer = 'stream: OK';
  /** Raw INSTREAM payload received by the fake clamd. */
  let received = Buffer.alloc(0);
  const tracked = new Set<Socket>();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'alims-clamd-'));
    (storageConfig as { get: (k: string) => string }).get = (key: string) =>
      key === 'STORAGE_ROOT' ? root : 't'.repeat(40);
    storage = new LocalStorage(storageConfig);

    server = createServer((socket: Socket) => {
      tracked.add(socket);
      socket.on('close', () => tracked.delete(socket));
      socket.on('error', () => undefined);

      let buffer = Buffer.alloc(0);
      let greeted = false;
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!greeted) {
          const nul = buffer.indexOf(0);
          if (nul === -1) return;
          buffer = buffer.subarray(nul + 1);
          greeted = true;
        }
        // INSTREAM frames: 4-byte big-endian length + payload; 0-length ends.
        for (;;) {
          if (buffer.length < 4) break;
          const length = buffer.readUInt32BE(0);
          if (length === 0) {
            socket.end(`${answer}\0`);
            return;
          }
          if (buffer.length < 4 + length) break;
          received = Buffer.concat([received, buffer.subarray(4, 4 + length)]);
          buffer = buffer.subarray(4 + length);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const socket of tracked) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  const deposit = async (payload: string): Promise<string> => {
    const uploadId = '71111111-2222-4333-8444-555555555555';
    await storage.writePart(uploadId, 1, Readable.from([payload]));
    await storage.assemble(
      uploadId,
      `versions/scan-${Date.now()}/object.bin`,
      Buffer.byteLength(payload),
    );
    // Return the last assembled key — assemble() resolves the digest, not the key.
    return storage.lastAssembledKey();
  };

  it('speaks INSTREAM: greeting, chunks, terminator — and reports clean', async () => {
    answer = 'stream: OK';
    received = Buffer.alloc(0);
    const key = await deposit('perfectly ordinary file bytes');
    const scanner = new ClamavScanner('127.0.0.1', port);
    const outcome = await scanner.scan(key, storage);

    expect(outcome).toEqual({ status: 'clean' });
    expect(received.toString()).toBe('perfectly ordinary file bytes');
  });

  it('parses an infected verdict and keeps only the signature name', async () => {
    answer = 'stream: Win.Test.EICAR_HDB-1 FOUND';
    received = Buffer.alloc(0);
    const key = await deposit('suspicious payload bytes');
    const scanner = new ClamavScanner('127.0.0.1', port);
    const outcome = await scanner.scan(key, storage);

    expect(outcome).toEqual({ status: 'infected', signature: 'Win.Test.EICAR_HDB-1 FOUND' });
  });

  it('reports failure when the scanner is unreachable', async () => {
    const scanner = new ClamavScanner('127.0.0.1', 1); // nothing listens here
    const outcome = await scanner.scan('versions/whatever/object.bin', storage);
    expect(outcome.status).toBe('failed');
  }, 35_000);

  it('NoScanner tells the truth: unsupported, never clean', async () => {
    const none = new NoScanner();
    expect(none.configured).toBe(false);
    const outcome = await none.scan();
    expect(outcome.status).toBe('unsupported');
    expect((outcome as { message: string }).message).toContain('No virus scanner is configured');
  });
});
