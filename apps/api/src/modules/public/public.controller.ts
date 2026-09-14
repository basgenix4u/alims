import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../interface/decorators/public.decorator';
import { ZodValidationPipe } from '../../interface/pipes/zod-validation.pipe';
import { PublicService } from './public.service';
import { publicSearchQuerySchema } from './public-query';

/**
 * Unauthenticated public surfaces (api_specification.md §8, §13).
 *
 * These routes opt out of authentication explicitly and their responses are
 * narrow, contract-typed projections (PRD §6.4/§6.10): assessment data,
 * identity numbers, private review material, files and contact details
 * are not reachable from this path.
 */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(@Inject(PublicService) private readonly surfaces: PublicService) {}

  @Get('search')
  @ApiOperation({ summary: 'Public discovery search (narrow projection)' })
  async search(@Query(new ZodValidationPipe(publicSearchQuerySchema)) query: never) {
    return this.surfaces.search(query as never);
  }

  @Get('records/:nxrId')
  @ApiOperation({ summary: 'Public record detail by NXR id' })
  async record(@Param('nxrId') nxrId: string) {
    return this.surfaces.recordByNxrId(nxrId);
  }

  @Get('verify/:qrToken')
  @ApiOperation({ summary: 'Public certificate verification by QR token' })
  async verify(@Param('qrToken') qrToken: string) {
    return this.surfaces.verify(qrToken);
  }
}
