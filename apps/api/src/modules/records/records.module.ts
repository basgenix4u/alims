import { Module } from '@nestjs/common';
import { RecordController } from './interface/record.controller';
import { RecordService } from './application/record.service';
import { RECORD_REPOSITORY } from './domain/record.repository';
import { InMemoryRecordRepository } from './infrastructure/in-memory-record.repository';

@Module({
  controllers: [RecordController],
  providers: [
    RecordService,
    // Production swaps to a Prisma-backed repository in T-201; the port and
    // application layer remain unchanged.
    { provide: RECORD_REPOSITORY, useClass: InMemoryRecordRepository },
  ],
  exports: [RecordService],
})
export class RecordsModule {}
