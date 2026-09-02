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
import { RecordService } from '../application/record.service';
import { RecordDraftInput, ResearchRecord } from '../domain/record.entity';
import { RecordsErrorFilter } from './records-error.filter';

/**
 * HTTP adapter for the Records domain (api_specification.md §5).
 *
 * Auth (T-100) and the request-scoped `ownerUserId` are stubbed to a fixed
 * dev actor until the auth module lands; the service still enforces owner
 * scoping so the wiring is already correct. Errors are mapped to RFC 9457
 * Problem Details via the global filter.
 */
@ApiTags('records')
@Controller('records')
@UseFilters(RecordsErrorFilter)
export class RecordController {
  constructor(@Inject(RecordService) private readonly records: RecordService) {}

  /** Dev actor until auth (T-100). Replaced by `@CurrentUser()` in T-100. */
  private get devOwnerUserId(): string {
    return process.env.DEV_OWNER_USER_ID ?? '00000000-0000-0000-0000-000000000000';
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: RecordDraftInput): Promise<ResearchRecord> {
    return this.records.createDraft(this.devOwnerUserId, body);
  }

  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.records.listMine(this.devOwnerUserId, {
      limit: parsedLimit,
      cursor: cursor ?? null,
    });
  }

  @Get('schema')
  schema() {
    return this.records.getFieldSchema();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ResearchRecord> {
    return this.records.getById(id, this.devOwnerUserId);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Partial<RecordDraftInput>) {
    return this.records.updateDraft(id, this.devOwnerUserId, body);
  }

  @Post(':id/submit')
  @HttpCode(200)
  async submit(@Param('id') id: string) {
    const record = await this.records.getById(id, this.devOwnerUserId);
    this.records.assertReadyForSubmission(record);
    // Full submit orchestration (workflow instance, version, receipt) is T-201/T-300.
    return { record, ready: true };
  }
}
