import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  taskListQuerySchema,
  taskDecisionSchema,
  type TaskDecisionInput,
  type TaskListQuery,
} from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { WorkflowService } from '../application/workflow.service';

/**
 * Reviewer task endpoints (api_specification.md §7). The queue is
 * assignee-scoped; decisions are restricted to the assigned reviewer with
 * the task.decide capability in the record's institution (service-side).
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(@Inject(WorkflowService) private readonly workflow: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'The caller’s review queue' })
  async list(
    @CurrentUser() user: { userId: string },
    @Query(new ZodValidationPipe(taskListQuerySchema)) query: TaskListQuery,
  ) {
    return this.workflow.listTasks(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task detail: record, version, prior decisions' })
  async detail(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.workflow.taskDetail(user.userId, id);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Record the review decision (assigned reviewer only)' })
  async decide(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(taskDecisionSchema)) body: TaskDecisionInput,
  ) {
    return this.workflow.decideTask(user.userId, id, body);
  }
}
