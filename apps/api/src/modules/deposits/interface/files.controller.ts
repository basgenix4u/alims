import { Controller, Get, Param, Put, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { Public } from '../../../interface/decorators/public.decorator';
import { DepositService } from '../application/deposit.service';

/**
 * Storage-facing endpoints for the LOCAL storage mode. Authorisation is the
 * signed, short-lived token minted at init/download time — the equivalent of
 * presigned URLs in S3 mode. Nothing here trusts the caller's identity.
 */
@ApiTags('files')
@Public()
@Controller('files')
export class FilesController {
  constructor(private readonly deposits: DepositService) {}

  @Put('parts/:uploadId/:partNumber')
  @ApiOperation({ summary: 'Upload one part (signed token in query)' })
  async putPart(
    @Param('uploadId') uploadId: string,
    @Param('partNumber') partNumber: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
  ) {
    const part = Number(partNumber);
    if (!Number.isInteger(part) || part < 1 || !token) {
      return { error: 'invalid part request' };
    }
    return this.deposits.putPart(uploadId, part, token, req);
  }

  @Get('download/:token')
  @ApiOperation({ summary: 'Stream an object for a signed download token' })
  async download(
    @Param('token') token: string,
    @Query('key') key: string | undefined,
    @Res() res: Response,
  ) {
    if (!key) {
      res.status(404).json({ title: 'NotFoundException', status: 404, detail: 'Not found.' });
      return;
    }
    let stream: NodeJS.ReadableStream;
    try {
      stream = await this.deposits.openDownload(token, key);
    } catch {
      res.status(404).json({ title: 'NotFoundException', status: 404, detail: 'Not found.' });
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    Readable.from(stream as never).pipe(res);
  }
}
