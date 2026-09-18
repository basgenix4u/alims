import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstitutionController } from './interface/institution.controller';
import { MembersController } from './interface/members.controller';
import { InstitutionService } from './application/institution.service';
import { MembershipService } from './application/membership.service';

/** AuthModule supplies TokenService for the step-up guard on status changes. */
@Module({
  imports: [AuthModule],
  controllers: [InstitutionController, MembersController],
  providers: [InstitutionService, MembershipService],
  exports: [InstitutionService, MembershipService],
})
export class InstitutionsModule {}
