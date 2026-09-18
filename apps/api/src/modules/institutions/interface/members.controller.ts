import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addMemberSchema,
  bulkInviteSchema,
  memberListQuerySchema,
  updateMemberSchema,
  type AddMemberInput,
  type BulkInviteInput,
  type MemberListQuery,
  type UpdateMemberInput,
} from '@alims/contracts';
import { CurrentUser } from '../../../interface/decorators/current-user.decorator';
import { RequireAction } from '../../../interface/decorators/require-action.decorator';
import { RequireStepUp } from '../../../interface/decorators/require-step-up.decorator';
import { StepUpGuard } from '../../../interface/guards/step-up.guard';
import { PolicyGuard } from '../../../interface/guards/policy.guard';
import { ZodValidationPipe } from '../../../interface/pipes/zod-validation.pipe';
import { MembershipService } from '../application/membership.service';

/**
 * Member management HTTP surface (api_specification.md §4 "Members").
 *
 * Institution-scoped routes bind the tenant from the path parameter, so
 * the policy guard can check the member.read / member.manage capability
 * on the same request. The /members/:memberId routes carry no
 * institution in the path: the tenant is the client's proven claim and
 * row-level security hides every other institution's rows (404).
 *
 * Revocation is a status write, never a hard delete — DELETE returns
 * 204 but the row, its role history and its attribution remain.
 */
@ApiTags('institutions')
@Controller()
export class MembersController {
  constructor(@Inject(MembershipService) private readonly members: MembershipService) {}

  @Get('institutions/:institutionId/members')
  @UseGuards(PolicyGuard)
  @RequireAction('member:list')
  @ApiOperation({ summary: 'Institution members, newest filters first (member.read)' })
  async list(
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: MemberListQuery,
    @Param('institutionId') institutionId: string,
  ) {
    return this.members.list(institutionId, query);
  }

  @Post('institutions/:institutionId/members')
  @UseGuards(PolicyGuard)
  @RequireAction('member:invite')
  @HttpCode(201)
  @ApiOperation({ summary: 'Add an existing ALIMS account as a member (member.manage)' })
  async add(
    @CurrentUser() user: { userId: string },
    @Param('institutionId') institutionId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) body: AddMemberInput,
  ) {
    return this.members.add(institutionId, user.userId, body);
  }

  @Post('institutions/:institutionId/members/bulk-invite')
  @UseGuards(PolicyGuard)
  @RequireAction('member:invite')
  @HttpCode(202)
  @ApiOperation({ summary: 'Invite up to 500 emails; per-item outcomes (member.manage)' })
  async bulkInvite(
    @CurrentUser() user: { userId: string },
    @Param('institutionId') institutionId: string,
    @Body(new ZodValidationPipe(bulkInviteSchema)) body: BulkInviteInput,
  ) {
    return this.members.bulkInvite(institutionId, user.userId, body);
  }

  @Patch('members/:memberId')
  @UseGuards(StepUpGuard)
  @RequireStepUp('member.role.change')
  @ApiOperation({ summary: 'Role/status change — step-up required (member.manage)' })
  async update(
    @CurrentUser() user: { userId: string },
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.update(memberId, user.userId, body);
  }

  @Delete('members/:memberId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a membership — the row is never deleted' })
  async revoke(
    @CurrentUser() user: { userId: string },
    @Param('memberId') memberId: string,
  ) {
    await this.members.revoke(memberId, user.userId);
  }
}
