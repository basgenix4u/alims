import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstitutionController } from './interface/institution.controller';
import { InstitutionService } from './application/institution.service';

/** AuthModule supplies TokenService for the step-up guard on status changes. */
@Module({
  imports: [AuthModule],
  controllers: [InstitutionController],
  providers: [InstitutionService],
  exports: [InstitutionService],
})
export class InstitutionsModule {}
