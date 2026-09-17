import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { verifyRecordSchema, type VerifyRecordInput } from '@alims/contracts';
import { z } from 'zod';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { RequireStepUp } from '../../../interface/decorators/require-step-up.decorator';
import { StepUpGuard } from '../../../interface/guards/step-up.guard';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { WorkflowService } from '../application/workflow.service';

/**
 * Record-level workflow actions (api_specification.md §7).
 *
 * Verification is the consequential action: registry/examiner capability
 * (service-side) AND a fresh step-up assertion (route guard).
 */
@ApiTags('records')
@Controller('records')
export class WorkflowController {
  constructor(@Inject(WorkflowService) private readonly workflow: WorkflowService) {}

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit the record for review (owner only)' })
  async submit(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.workflow.submitRecord(id, user.userId);
  }

  @Post(':id/verify')
  @UseGuards(StepUpGuard)
  @RequireStepUp('record.verify')
  @ApiOperation({ summary: 'Confer institutional verification (step-up required)' })
  async verify(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyRecordSchema)) body: VerifyRecordInput,
  ) {
    return this.workflow.verifyRecord(id, user.userId, body.versionId);
  }

  @Post(':id/escalate-integrity')
  @HttpCode(202)
  @ApiOperation({ summary: 'Raise an integrity concern for human review' })
  async escalate(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().min(10).max(2000) })))
    body: { reason: string },
  ) {
    return this.workflow.escalateIntegrity(id, user.userId, body.reason);
  }
}
