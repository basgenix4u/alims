import pino from 'pino';

/**
 * Background worker entrypoint.
 *
 * Processors are added by their owning agents:
 *   - scan / checksum       Agent 2 (T-203)
 *   - similarity polling    Agent 3 (T-301)
 *   - embargo expiry        Agent 3 (T-305)
 *   - notifications         Agent 1
 *
 * PRD §6.5: the similarity processor is advisory. It records assessment
 * results only and has no write path to record status.
 */
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  logger.info('ALIMS worker starting');
  logger.info('No processors registered yet — queues are wired in T-203/T-301/T-305');

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down worker');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
