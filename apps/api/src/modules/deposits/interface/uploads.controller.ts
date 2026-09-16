import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uploadCompleteSchema,
  uploadInitSchema,
  type UploadCompleteInput,
  type UploadInitInput,
} from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { DepositService } from '../application/deposit.service';

/**
 * Upload sessions (api_specification.md §6). Init hands out signed part
 * URLs; complete verifies the part inventory, assembles and checksums the
 * object, records the deposit receipt and queues the safety scan.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(DepositService) private readonly deposits: DepositService) {}

  @Post('init')
  @ApiOperation({ summary: 'Open a multipart upload session' })
  async init(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(uploadInitSchema)) body: UploadInitInput,
  ) {
    return this.deposits.initUpload(user.userId, body);
  }

  @Post(':uploadId/complete')
  @ApiOperation({ summary: 'Assemble parts, checksum, receipt, queue scan' })
  async complete(
    @CurrentUser() user: { userId: string },
    @Param('uploadId') uploadId: string,
    @Body(new ZodValidationPipe(uploadCompleteSchema)) body: UploadCompleteInput,
  ) {
    return this.deposits.completeUpload(user.userId, uploadId, body.parts);
  }

  @Get(':uploadId/status')
  @ApiOperation({ summary: 'Scan/checksum/progress status' })
  async status(@CurrentUser() user: { userId: string }, @Param('uploadId') uploadId: string) {
    return this.deposits.uploadStatus(user.userId, uploadId);
  }
}
