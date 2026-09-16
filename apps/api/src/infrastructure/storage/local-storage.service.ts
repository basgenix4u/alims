import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/**
 * Storage boundary for file deposits (api_specification.md §6).
 *
 * The contract is presigned-multipart: the API hands out short-lived part
 * URLs and clients upload directly to storage. The local adapter implements
 * the same shape for single-node deployments — part PUTs are signed token
 * URLs served by the API itself, and everything assembles on the same
 * filesystem. An S3 adapter can implement this port later without touching
 * the application layer.
 */
export interface StoragePort {
  /** Persist one part; resolves to its etag (sha256 of the part bytes). */
  writePart(uploadId: string, partNumber: number, body: Readable): Promise<string>;
  /** Part numbers already persisted, ascending. */
  listParts(uploadId: string): Promise<number[]>;
  /** Concatenate parts in order into `key`; resolves to the overall sha256. */
  assemble(uploadId: string, key: string, expectedBytes: number): Promise<string>;
  /** Stream an assembled object back out. */
  openObject(key: string): Promise<Readable>;
  /** Remove all part scratch files for an upload session. */
  discardParts(uploadId: string): Promise<void>;
}

export interface SignedUrl {
  /** The URL a client PUTs/GETs. */
  url: string;
  /** Absolute expiry; verification fails afterwards. */
  expiresAt: Date;
}

@Injectable()
export class LocalStorage implements StoragePort {
  private readonly root: string;
  private readonly tokenSecret: Buffer;
  private lastKey: string | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('STORAGE_ROOT'));
    this.tokenSecret = createHash('sha256')
      .update(config.get('UPLOAD_TOKEN_SECRET'))
      .digest();
  }

  private uploadDir(uploadId: string): string {
    // uploadId is server-generated (uuid); still, never let it escape the root.
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error('invalid upload id');
    return join(this.root, 'uploads', uploadId);
  }

  private objectPath(key: string): string {
    const path = resolve(join(this.root, 'objects', key));
    if (!path.startsWith(join(this.root, 'objects'))) {
      throw new Error('invalid object key');
    }
    return path;
  }

  async writePart(uploadId: string, partNumber: number, body: Readable): Promise<string> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
      throw new Error('invalid part number');
    }
    const dir = this.uploadDir(uploadId);
    await mkdir(dir, { recursive: true });
    const target = join(dir, `${partNumber}.part`);
    const hash = createHash('sha256');
    const through = new Readable({
      read() {
        /* passthrough wired below via pipeline */
      },
    });
    // Hash while streaming to disk — one pass, no buffering.
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      through.push(chunk);
    });
    const ended = new Promise<void>((resolveEnd, rejectEnd) => {
      body.on('end', () => {
        through.push(null);
        resolveEnd();
      });
      body.on('error', (err) => {
        through.destroy(err);
        rejectEnd(err);
      });
    });
    await Promise.all([ended, pipeline(through, createWriteStream(target))]);
    return hash.digest('hex');
  }

  async listParts(uploadId: string): Promise<number[]> {
    try {
      const dir = this.uploadDir(uploadId);
      const { readdir } = await import('node:fs/promises');
      const names = await readdir(dir);
      return names
        .filter((n) => /^\d+\.part$/.test(n))
        .map((n) => Number(n.slice(0, -5)))
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  async assemble(uploadId: string, key: string, expectedBytes: number): Promise<string> {
    const parts = await this.listParts(uploadId);
    if (parts.length === 0) throw new Error('no parts uploaded');

    const target = this.objectPath(key);
    await mkdir(dirname(target), { recursive: true });

    const hash = createHash('sha256');
    let total = 0;
    const out = createWriteStream(target);
    for (const part of parts) {
      const source = createReadStream(join(this.uploadDir(uploadId), `${part}.part`));
      await pipeline(
        source,
        async function* (chunks) {
          for await (const chunk of chunks) {
            hash.update(chunk as Buffer);
            total += (chunk as Buffer).length;
            yield chunk as Buffer;
          }
        },
        out,
        { end: part === parts[parts.length - 1] },
      );
    }
    if (total !== expectedBytes) {
      await rm(target, { force: true });
      throw new Error(`size mismatch: declared ${expectedBytes}, received ${total}`);
    }
    this.lastKey = key;
    return hash.digest('hex');
  }

  /** The key of the most recently assembled object (test affordance). */
  lastAssembledKey(): string {
    if (!this.lastKey) throw new Error('nothing assembled yet');
    return this.lastKey;
  }

  async openObject(key: string): Promise<Readable> {
    const path = this.objectPath(key);
    await stat(path); // throws when the object does not exist
    return createReadStream(path);
  }

  async discardParts(uploadId: string): Promise<void> {
    await rm(this.uploadDir(uploadId), { recursive: true, force: true });
  }

  // ── Signed access (the local-mode equivalent of presigned URLs) ──

  signPartUpload(basePath: string, uploadId: string, partNumber: number, ttlSeconds: number): SignedUrl {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = this.sign('put', uploadId, String(partNumber), expiresAt);
    return {
      url: `${basePath}/api/v1/files/parts/${uploadId}/${partNumber}?token=${token}`,
      expiresAt,
    };
  }

  signDownload(basePath: string, key: string, ttlSeconds: number): SignedUrl {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = this.sign('get', key, '', expiresAt);
    return {
      url: `${basePath}/api/v1/files/download/${encodeURIComponent(token)}?key=${encodeURIComponent(key)}`,
      expiresAt,
    };
  }

  verifyPartToken(token: string, uploadId: string, partNumber: number): boolean {
    return this.verify('put', token, uploadId, String(partNumber));
  }

  verifyDownloadToken(token: string, key: string): boolean {
    return this.verify('get', token, key, '');
  }

  private sign(mode: 'put' | 'get', scope: string, extra: string, expiresAt: Date): string {
    const payload = `${mode}|${scope}|${extra}|${expiresAt.getTime()}`;
    const mac = createHmac('sha256', this.tokenSecret).update(payload).digest('base64url');
    return `${expiresAt.getTime()}.${mac}`;
  }

  private verify(mode: 'put' | 'get', token: string, scope: string, extra: string): boolean {
    const [expiry, mac] = token.split('.');
    if (!expiry || !mac) return false;
    const expected = createHmac('sha256', this.tokenSecret)
      .update(`${mode}|${scope}|${extra}|${expiry}`)
      .digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return Number(expiry) > Date.now();
  }
}
