import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificateService } from './application/certificate.service';
import { CertificateController } from './interface/certificate.controller';

/** AuthModule supplies TokenService for the step-up guard on issue/revoke. */
@Module({
  imports: [AuthModule],
  controllers: [CertificateController],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificatesModule {}
