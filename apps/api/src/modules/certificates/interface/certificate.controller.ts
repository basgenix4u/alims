import { Body, Controller, Get, Inject, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  issueCertificateSchema,
  revokeCertificateSchema,
  type IssueCertificateInput,
  type RevokeCertificateInput,
} from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { RequireStepUp } from '../../../interface/decorators/require-step-up.decorator';
import { StepUpGuard } from '../../../interface/guards/step-up.guard';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { CertificateService } from '../application/certificate.service';

/**
 * Certificates (api_specification.md §8). Issuance and revocation are the
 * consequential actions: registry capability (service-side, in the record's
 * tenant) plus a fresh step-up assertion (route guard).
 */
@ApiTags('certificates')
@Controller()
export class CertificateController {
  constructor(@Inject(CertificateService) private readonly certificates: CertificateService) {}

  @Post('records/:recordId/certificate')
  @UseGuards(StepUpGuard)
  @RequireStepUp('certificate.issue')
  @ApiOperation({ summary: 'Issue a certificate for the verified version (step-up)' })
  async issue(
    @CurrentUser() user: { userId: string },
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(issueCertificateSchema)) body: IssueCertificateInput,
  ) {
    return this.certificates.issue(recordId, user.userId, body);
  }

  @Post('certificates/:id/revoke')
  @UseGuards(StepUpGuard)
  @RequireStepUp('certificate.revoke')
  @ApiOperation({ summary: 'Revoke a valid certificate (step-up)' })
  async revoke(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(revokeCertificateSchema)) body: RevokeCertificateInput,
  ) {
    return this.certificates.revoke(id, user.userId, body);
  }

  @Get('certificates/:id')
  @ApiOperation({ summary: 'Certificate detail (registry/librarian or owner)' })
  async get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.certificates.get(id, user.userId);
  }

  @Get('certificates/:id/pdf')
  @ApiOperation({ summary: 'Certificate PDF with verification QR' })
  async pdf(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const bytes = await this.certificates.renderPdf(id, user.userId);
    const buffer = Buffer.from(bytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="alims-certificate-${id.slice(0, 8)}.pdf"`,
    );
    res.end(buffer);
  }
}
