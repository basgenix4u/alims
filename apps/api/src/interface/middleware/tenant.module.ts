import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Global so any module can read the request's tenant context without
 * importing plumbing (ADR-009). The tenant boundary is cross-cutting.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
