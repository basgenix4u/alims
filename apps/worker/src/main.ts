import pino from 'pino';

/**
 * Background worker entrypoint.
 *
 * Processors are registered here as the subsystems land:
 *   - scan / checksum       (file safety pipeline)
 *   - similarity polling    (advisory signals only)
 *   - embargo expiry        (access windows)
 *   - notifications
 *
 * PRD §6.5: the similarity processor is advisory. It records assessment
 * results only and has no write path to record status.
 */
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  logger.info('ALIMS worker starting');
  logger.info('No processors registered yet — queues arrive with the scan, similarity and embargo subsystems');

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down worker');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
