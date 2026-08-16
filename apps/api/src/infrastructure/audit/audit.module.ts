import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global: every consequential action across every module must be able to
 * append to the audit trail without re-importing plumbing (PRD §9.1).
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
