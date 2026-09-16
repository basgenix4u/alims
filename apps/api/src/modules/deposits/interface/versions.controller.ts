import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createVersionSchema, type CreateVersionInput } from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { DepositService } from '../application/deposit.service';

/**
 * Version endpoints (api_specification.md §6). Versions are append-only:
 * creation is allowed from draft/returned/published states and nothing is
 * ever removed. Downloads are policy-gated in the service and audited.
 */
@ApiTags('records')
@Controller('records/:recordId/versions')
export class VersionsController {
  constructor(@Inject(DepositService) private readonly deposits: DepositService) {}

  @Get()
  @ApiOperation({ summary: 'Every version of a record, newest first' })
  async list(@CurrentUser() user: { userId: string }, @Param('recordId') recordId: string) {
    return { data: await this.deposits.listVersions(recordId, user.userId) };
  }

  @Post()
  @ApiOperation({ summary: 'Open a new append-only version' })
  async create(
    @CurrentUser() user: { userId: string },
    @Param('recordId') recordId: string,
    @Body(new ZodValidationPipe(createVersionSchema)) body: CreateVersionInput,
  ) {
    return this.deposits.createVersion(recordId, user.userId, body);
  }

  @Get(':versionId/download')
  @ApiOperation({ summary: 'Policy-gated download; 302 to a 60-second URL' })
  async download(
    @CurrentUser() user: { userId: string },
    @Param('recordId') recordId: string,
    @Param('versionId') versionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { url } = await this.deposits.requestDownload(recordId, versionId, user.userId);
    res.redirect(302, url);
  }
}
