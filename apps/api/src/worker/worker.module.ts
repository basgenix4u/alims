import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env';
import { AuditModule } from '../infrastructure/audit/audit.module';
import { EmailModule } from '../infrastructure/email/email.module';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { LocalStorage } from '../infrastructure/storage/local-storage.service';
import {
  EmbargoProcessor,
  OutboxProcessor,
  ScanProcessor,
  UploadSweepProcessor,
} from './processors';

/**
 * Worker process module (PRD §6.3 scan, §6.6 embargo expiry, §9 graceful
 * degradation): DB-backed polling processors over durable queues — the
 * outbox and status columns ARE the queues. Runs as
 * `node dist/worker.js` sharing the API's env; no HTTP surface.
 *
 * The DB-backed choice is deliberate for Release 1 (see DECISIONS.md):
 * zero extra infrastructure, honest at-rest state, exactly-once-ish
 * sweeps with idempotent processors. BullMQ/Redis remains the plan when
 * throughput actually demands a broker.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    PrismaModule,
    AuditModule,
    EmailModule,
  ],
  providers: [
    LocalStorage,
    OutboxProcessor,
    ScanProcessor,
    EmbargoProcessor,
    UploadSweepProcessor,
  ],
})
export class WorkerModule {}
