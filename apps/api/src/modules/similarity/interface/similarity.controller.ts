import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { similarityReviewSchema, type SimilarityReviewInput } from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { SimilarityService } from '../application/similarity.service';

/**
 * Similarity endpoints (api_specification.md §7, PRD §6.5).
 *
 * Authorised roles only — capability checks and RLS live in the service
 * and hide everything the caller may not see behind a 404. The review
 * records a human outcome with a reason; it never writes record status.
 */
@ApiTags('records')
@Controller('records/:recordId/versions/:versionId/similarity')
export class SimilarityController {
  constructor(@Inject(SimilarityService) private readonly similarity: SimilarityService) {}

  @Get()
  @ApiOperation({ summary: 'The version\u2019s similarity assessment (authorised roles only)' })
  async get(
    @CurrentUser() user: { userId: string },
    @Param('recordId') recordId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.similarity.getAssessment(recordId, versionId, user.userId);
  }

  @Post('review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record the human integrity review outcome (advisory only)' })
  async review(
    @CurrentUser() user: { userId: string },
    @Param('recordId') recordId: string,
    @Param('versionId') versionId: string,
    @Body(new ZodValidationPipe(similarityReviewSchema)) body: SimilarityReviewInput,
  ) {
    return this.similarity.reviewAssessment(recordId, versionId, user.userId, body);
  }
}
