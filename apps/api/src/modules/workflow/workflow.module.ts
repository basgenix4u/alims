import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { WorkflowService } from './application/workflow.service';
import { TasksController } from './interface/tasks.controller';
import { WorkflowController } from './interface/workflow.controller';

@Module({
  imports: [RecordsModule],
  controllers: [TasksController, WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
