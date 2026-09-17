import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createInstitutionSchema,
  institutionListQuerySchema,
  type CreateInstitutionInput,
  type InstitutionDetail,
  type InstitutionListQuery,
  type InstitutionStatusChangeInput,
  type UpdateInstitutionInput,
} from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { Public } from '../../../interface/decorators/public.decorator';
import { RequireAction } from '../../../interface/decorators/require-action.decorator';
import { RequireStepUp } from '../../../interface/decorators/require-step-up.decorator';
import { StepUpGuard } from '../../../interface/guards/step-up.guard';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { InstitutionService } from '../application/institution.service';

/**
 * HTTP adapter for the Institutions domain (api_specification.md §4).
 *
 * The directory is public; every other route is authenticated and
 * policy-checked. The path parameter is named `institutionId` (not `id`)
 * so the policy guard can bind the tenant for capability checks on the
 * same request — the URL shape is unchanged.
 */
@ApiTags('institutions')
@Controller('institutions')
export class InstitutionController {
  constructor(
    @Inject(InstitutionService) private readonly institutions: InstitutionService,
    private readonly tenants: TenantContextService,
  ) {}

  /** Public directory — row-level security shows verified institutions only. */
  @Public()
  @Get()
  async list(
    @Query(new ZodValidationPipe(institutionListQuerySchema)) query: InstitutionListQuery,
  ) {
    return this.institutions.list(query, this.tenants.current());
  }

  @Post()
  @RequireAction('institution:create')
  async create(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(createInstitutionSchema)) body: CreateInstitutionInput,
  ): Promise<InstitutionDetail> {
    return this.institutions.create(user.userId, body);
  }

  @Get(':institutionId')
  @RequireAction('institution:read')
  async get(@Param('institutionId') id: string): Promise<InstitutionDetail> {
    return this.institutions.getById(id, this.tenants.current());
  }

  @Patch(':institutionId')
  @RequireAction('institution:update')
  async update(
    @Param('institutionId') id: string,
    @Body() body: UpdateInstitutionInput,
  ): Promise<InstitutionDetail> {
    return this.institutions.update(id, this.tenants.current(), body);
  }

  /** Platform-level verify / suspend / archive. Step-up required. */
  @Patch(':institutionId/status')
  @RequireAction('institution:set_status')
  @UseGuards(StepUpGuard)
  @RequireStepUp('institution.status.change')
  async setStatus(
    @Param('institutionId') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: InstitutionStatusChangeInput,
  ): Promise<InstitutionDetail> {
    return this.institutions.setStatus(id, user.userId, body);
  }
}
