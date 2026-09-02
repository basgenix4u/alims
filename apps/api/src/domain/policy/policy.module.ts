import { Global, Module } from '@nestjs/common';
import { PolicyEngine } from './policy-engine';
import { PolicyService } from './policy.service';

/**
 * Global so every module — regardless of which agent owns it — can inject the
 * policy engine and resolve actors without importing plumbing. Authorization
 * is cross-cutting by nature (ADR-009).
 */
@Global()
@Module({
  providers: [PolicyEngine, PolicyService],
  exports: [PolicyEngine, PolicyService],
})
export class PolicyModule {}
