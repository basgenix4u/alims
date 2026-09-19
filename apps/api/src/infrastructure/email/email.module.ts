import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Global: auth (verification emails) and the worker processors share the
 * durable outbox without re-importing plumbing (ADR-009 pattern).
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
