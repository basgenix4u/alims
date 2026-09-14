import { Module } from '@nestjs/common';
import { RecordController } from './interface/record.controller';
import { RecordService } from './application/record.service';
import { RECORD_REPOSITORY } from './domain/record.repository';
import { PrismaRecordRepository } from './infrastructure/prisma-record.repository';

@Module({
  controllers: [RecordController],
  providers: [
    RecordService,
    // Production persistence: PostgreSQL with row-level security enforced
    // per request. Tests override this provider with the in-memory
    // implementation; the port and application layer are unchanged.
    { provide: RECORD_REPOSITORY, useClass: PrismaRecordRepository },
  ],
  exports: [RecordService],
})
export class RecordsModule {}
