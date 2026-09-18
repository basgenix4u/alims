import { Module } from '@nestjs/common';
import { SimilarityService } from './application/similarity.service';
import { SimilarityController } from './interface/similarity.controller';

/**
 * The similarity subsystem, isolated on purpose (ADR-004): its only
 * write targets are similarity_assessment and its append-only
 * integrity_review decisions. Keeping it in its own module makes the
 * "no write path to record status" invariant reviewable by inspection.
 * Prisma, audit, policy and tenant plumbing are global modules.
 */
@Module({
  controllers: [SimilarityController],
  providers: [SimilarityService],
  exports: [SimilarityService],
})
export class SimilarityModule {}
