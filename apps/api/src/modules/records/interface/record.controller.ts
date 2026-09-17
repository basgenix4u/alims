import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { RecordService } from '../application/record.service';
import { RecordDraftInput, ResearchRecord } from '../domain/record.entity';
import { RecordsErrorFilter } from './records-error.filter';

/**
 * HTTP adapter for the Records domain (api_specification.md §5).
 *
 * Every route is authenticated (global JwtAuthGuard, deny-by-default) and
 * scoped to the requesting user via `@CurrentUser()` — the record owner is
 * never a client-supplied value. Errors are mapped to RFC 9457 Problem
 * Details; cross-tenant misses surface as 404 (no existence leak).
 */
@ApiTags('records')
@Controller('records')
@UseFilters(RecordsErrorFilter)
export class RecordController {
  constructor(@Inject(RecordService) private readonly records: RecordService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: { userId: string },
    @Body() body: RecordDraftInput,
  ): Promise<ResearchRecord> {
    return this.records.createDraft(user.userId, body);
  }

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.records.listMine(user.userId, {
      limit: parsedLimit,
      cursor: cursor ?? null,
    });
  }

  @Get('schema')
  schema() {
    return this.records.getFieldSchema();
  }

  @Get(':id')
  async get(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ): Promise<ResearchRecord> {
    return this.records.getById(id, user.userId);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: Partial<RecordDraftInput>,
  ) {
    return this.records.updateDraft(id, user.userId, body);
  }

}

