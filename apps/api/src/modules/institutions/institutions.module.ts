import { Module } from '@nestjs/common';
import { InstitutionController } from './interface/institution.controller';
import { InstitutionService } from './application/institution.service';

@Module({
  controllers: [InstitutionController],
  providers: [InstitutionService],
  exports: [InstitutionService],
})
export class InstitutionsModule {}
