/**
 * ALIMS worker process — the background half of the platform
 * (PRD §6.3 virus scan recovery, §6.6 embargo expiry, §9 graceful
 * degradation, api_specification.md §3 email outbox).
 *
 *   node dist/worker.js          long-running poll loop
 *   node dist/worker.js --once   one cycle then exit (cron-style)
 *
 * Processors are idempotent and DB-backed: every cycle is a sweep over
 * rows whose state says work is due. A cycle never throws — one failing
 * processor is logged and the rest still run.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WorkerModule } from './worker.module';
import {
  EmbargoProcessor,
  OutboxProcessor,
  ScanProcessor,
  UploadSweepProcessor,
  type CycleResult,
} from './processors';
import type { Env } from '../config/env';

const logger = new Logger('Worker');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
  const config = app.get(ConfigService<Env, true>);
  const intervalMs = config.get('WORKER_POLL_INTERVAL_MS', { infer: true });

  const processors = [
    app.get(OutboxProcessor),
    app.get(ScanProcessor),
    app.get(EmbargoProcessor),
    app.get(UploadSweepProcessor),
  ];

  const once = process.argv.includes('--once');

  let running = false;
  let cycles = 0;

  const cycle = async (): Promise<void> => {
    if (running) return; // overlap protection: skip if the last cycle still runs
    running = true;
    const startedAt = Date.now();
    const results: CycleResult[] = [];
    for (const processor of processors) {
      try {
        results.push(await processor.runOnce());
      } catch (error) {
        // The cycle survives a failing processor; operators see the error.
        logger.error(`${processor.constructor.name} failed: ${String(error)}`);
      }
    }
    cycles += 1;
    const acted = results.reduce((sum, r) => sum + r.acted, 0);
    // Quiet by default: log only work done, errors, and a heartbeat every
    // 60 cycles so silence never hides a dead process from the logs alone.
    if (acted > 0) {
      const detail = results
        .filter((r) => r.acted > 0 || r.note)
        .map((r) => `${r.name}: ${r.acted}${r.note ? ` (${r.note})` : ''}`)
        .join(' · ');
      logger.log(`cycle ${cycles}: ${detail} in ${Date.now() - startedAt}ms`);
    } else if (cycles % 60 === 1) {
      logger.log(`heartbeat cycle ${cycles}: nothing due (poll every ${intervalMs}ms)`);
    }
    running = false;
  };

  logger.log(`ALIMS worker starting (${once ? 'single cycle' : `poll every ${intervalMs}ms`}).`);
  await cycle();

  if (once) {
    await app.close();
    return;
  }

  const timer = setInterval(() => void cycle(), intervalMs);

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — draining and shutting down.`);
    clearInterval(timer);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap().catch((error) => {
  logger.error(`worker failed to start: ${String(error)}`);
  process.exit(1);
});
