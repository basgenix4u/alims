import { Module } from '@nestjs/common';
import { DepositService } from './application/deposit.service';
import { FilesController } from './interface/files.controller';
import { UploadsController } from './interface/uploads.controller';
import { VersionsController } from './interface/versions.controller';
import { LocalStorage } from '../../infrastructure/storage/local-storage.service';

@Module({
  controllers: [VersionsController, UploadsController, FilesController],
  providers: [DepositService, LocalStorage],
  exports: [DepositService],
})
export class DepositsModule {}
