import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import type { StoragePort } from '../../../infrastructure/storage/local-storage.service';

/**
 * Virus scanning for deposited files (api_specification.md §6, PRD §8).
 *
 * Results are advisory-to-the-download-gate only: 'infected' blocks the
 * download and surfaces a plain-language message; 'unsupported' is the
 * HONEST result when no scanner is configured — it is never reported as
 * 'clean' (PRD §9.1: never fake a healthy dependency).
 */
export type ScanOutcome =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'unsupported'; message: string }
  | { status: 'failed'; message: string };

export interface VirusScannerPort {
  readonly name: string;
  /** True when a real scanner backend is configured. */
  readonly configured: boolean;
  scan(key: string, storage: StoragePort): Promise<ScanOutcome>;
}

/**
 * ClamAV clamd adapter — the INSTREAM command over TCP.
 *
 * Protocol: `zINSTREAM\0`, then length-prefixed chunks (4-byte big-endian),
 * terminated by a zero-length chunk. Response `stream: OK` = clean,
 * `stream: <SIGNATURE> FOUND` = infected.
 */
@Injectable()
export class ClamavScanner implements VirusScannerPort {
  readonly name = 'clamav';
  readonly configured = true;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  async scan(key: string, storage: StoragePort): Promise<ScanOutcome> {
    const { Socket } = await import('node:net');
    return new Promise<ScanOutcome>((resolve) => {
      const socket = new Socket();
      let response = '';
      const fail = (message: string) => {
        socket.destroy();
        resolve({ status: 'failed', message });
      };

      socket.setTimeout(30_000);
      socket.once('timeout', () => fail('scanner timed out'));
      socket.once('error', () => fail('scanner unreachable'));

      socket.connect(this.port, this.host, () => {
        void (async () => {
          try {
            socket.write('zINSTREAM\0');
            const stream = await storage.openObject(key);
        stream.on('data', (chunk: Buffer) => {
          const header = Buffer.alloc(4);
          header.writeUInt32BE(chunk.length, 0);
          if (!socket.write(Buffer.concat([header, chunk]))) {
            stream.pause();
            socket.once('drain', () => stream.resume());
          }
        });
            stream.on('error', () => fail('could not read the deposited file'));
            stream.on('end', () => {
              const terminator = Buffer.alloc(4);
              terminator.writeUInt32BE(0, 0);
              socket.write(terminator);
            });
          } catch {
            fail('could not read the deposited file');
          }
        })();
      });

      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
      });
      socket.on('close', () => {
        // clamd terminates its response with NUL — not whitespace to trim().
        const trimmed = response.replace(/\0/g, '').trim();
        if (trimmed.endsWith('OK')) {
          resolve({ status: 'clean' });
        } else if (trimmed.includes('FOUND')) {
          // Only the signature name is retained; nothing about the
          // environment is disclosed to the depositor.
          resolve({ status: 'infected', signature: trimmed.replace(/^stream:\s*/, '') });
        } else {
          resolve({ status: 'failed', message: 'scanner returned an unexpected result' });
        }
      });
    });
  }
}

/** Fallback when no scanner is configured: report the truth, never 'clean'. */
@Injectable()
export class NoScanner implements VirusScannerPort {
  readonly name = 'none';
  readonly configured = false;

  async scan(): Promise<ScanOutcome> {
    return {
      status: 'unsupported',
      message:
        'No virus scanner is configured for this deployment. Contact the repository administrator before relying on this file.',
    };
  }
}

export function makeScanner(config: ConfigService<Env, true>): VirusScannerPort {
  const host = config.get('AV_CLAMD_HOST');
  if (host) {
    return new ClamavScanner(host, config.get('AV_CLAMD_PORT'));
  }
  return new NoScanner();
}
