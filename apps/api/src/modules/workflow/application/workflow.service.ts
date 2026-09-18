import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type MemberRole,
  type OutputType,
  type ReviewTask,
  type ReviewTaskDetail,
  type TaskDecisionInput,
  type TaskListQuery,
  type TaskStatus,
  taskDecisionSchema,
} from '@alims/contracts';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PolicyEngine } from '../../../domain/policy/policy-engine';
import { PolicyService } from '../../../domain/policy/policy.service';
import type { Resource } from '../../../domain/policy/policy';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';
import { RecordService } from '../../records/application/record.service';

/**
 * Review workflow engine (api_specification.md §7, PRD §7.1).
 *
 * The lifecycle, all transitions carried by human decisions:
 *
 *   draft ──submit──▶ submitted ──task──▶ in_review ──verify──▶ institutionally_verified
 *     ▲                                          │
 *     └──────── return_for_revision ◀────────────┘
 *                (a new version is required to progress)
 *
 * Invariants encoded here:
 *   - only the owner submits; only the assigned reviewer decides
 *   - a returned record needs a NEW version before resubmission
 *   - verification is registry/examiner + step-up (route guard) and only
 *     from a VERIFIED institution (PRD §6.1)
 *   - the final stage completes only through verification — an ordinary
 *     task decision can never mark a record institutionally verified
 *   - no auto-approval on deadline lapse (PRD §8): nothing here reacts to
 *     dueAt except honest isOverdue reporting
 */

/** Default two-stage review flow when an institution has no template. */
export const DEFAULT_STAGES: ReadonlyArray<{ name: string; roles: MemberRole[] }> = [
  { name: 'supervisor-review', roles: ['supervisor', 'dept_admin'] },
  { name: 'registry-verification', roles: ['registry', 'examiner', 'dept_admin'] },
];

export function nextStage(stages: readonly string[], current: string): string | null {
  const index = stages.indexOf(current);
  if (index === -1 || index === stages.length - 1) return null;
  return stages[index + 1]!;
}

/** NXR ids are minted per calendar year, sequential per deployment. */
export function formatNxrId(year: number, sequence: number): string {
  return `NXR-${year}-${String(sequence).padStart(6, '0')}`;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
    private readonly audit: AuditService,
    private readonly records: RecordService,
    private readonly policies: PolicyService,
    private readonly engine: PolicyEngine,
  ) {}

  /**
   * Submit a record for review. Owner-only; the record must be submittable
   * (complete metadata) and carry a deposited version whose scan is clean
   * (or honestly unsupported — an unclean scan blocks submission).
   */
  async submitRecord(recordId: string, userId: string): Promise<{ record: unknown; taskId: string }> {
    const ctx = this.tenants.current();
    // Owner-scoped load + metadata readiness (the record service owns both
    // contracts — distinct 422 codes surface from its validator).
    const entity = await this.records.getById(recordId, userId);
    const isResubmission = entity.status !== 'draft';
    const submittable = ['draft', 'returned_for_revision', 'resubmitted'];
    if (!submittable.includes(entity.status)) {
      throw new ConflictException('This record cannot be submitted in its current state.');
    }
    this.records.assertReadyForSubmission(entity);

    // Effective tenant for the mutation: the client's proven claim when
    // present, else the record's own institution. The lazy default
    // workflow-template insert is institution-scoped under RLS, and a
    // claim-less submit (a plain `POST /records/:id/submit`) is a legal
    // call — the record's affiliation was proven when it was created.
    const institutionId = ctx.institutionId ?? entity.institutionId ?? null;

    return this.prisma.withTenant({ userId, institutionId }, async (tx) => {
      const record = await tx.researchRecord.findUnique({ where: { id: recordId } });
      if (!record || record.ownerUserId !== userId) {
        throw new NotFoundException('Record not found.');
      }

      const version = await tx.recordVersion.findFirst({
        where: { recordId },
        orderBy: { versionNo: 'desc' },
      });
      if (!version || !version.fileKey) {
        throw new ConflictException(
          'Deposit a file version before submitting for review.',
        );
      }
      if (version.scanStatus === 'infected' || version.scanStatus === 'failed') {
        throw new ConflictException(
          'The deposited file did not pass the safety scan and cannot be submitted.',
        );
      }

      const template = await this.ensureDefaultTemplate(tx, record.institutionId!, record.outputType);
      const stages = (template.stages as Array<{ name: string; roles: MemberRole[] }>).map(
        (s) => s.name,
      );

      let instance = await tx.workflowInstance.findUnique({ where: { recordId } });
      if (!instance) {
        instance = await tx.workflowInstance.create({
          data: {
            id: randomUUID(),
            recordId,
            templateId: template.id,
            currentStage: stages[0]!,
          },
        });
      }

      // A returned record requires a NEW version to progress (PRD §7.1):
      // the version that was returned can never be resubmitted as-is.
      if (isResubmission && version.state !== 'draft') {
        // The returned version is sealed at 'submitted'; only a fresh draft
        // version can carry the resubmission (PRD §7.1).
        throw new ConflictException(
          'A returned record requires a new version before it can be resubmitted.',
        );
      }

      const assignee = await this.pickAssignee(
        tx,
        record.institutionId!,
        (template.stages as Array<{ name: string; roles: MemberRole[] }>)[0]!.roles,
      );
      if (!assignee) {
        throw new ConflictException(
          'No eligible reviewer is available for this institution yet. Contact the registry.',
        );
      }

      await tx.recordVersion.update({
        where: { id: version.id },
        data: { state: 'submitted', submittedById: userId, submittedAt: new Date() },
      });
      await tx.workflowInstance.update({
        where: { id: instance.id },
        data: { currentStage: stages[0]!, isComplete: false },
      });
      const task = await tx.reviewTask.create({
        data: {
          id: randomUUID(),
          workflowInstanceId: instance.id,
          versionId: version.id,
          assigneeUserId: assignee,
          stage: stages[0]!,
        },
      });
      const updated = await tx.researchRecord.update({
        where: { id: recordId },
        data: { status: isResubmission ? 'resubmitted' : 'submitted' },
      });

      await this.audit.record(
        {
          action: 'record.submitted',
          subjectType: 'research_record',
          subjectId: recordId,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { versionId: version.id, versionNo: version.versionNo, resubmission: isResubmission },
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'task.created',
          subjectType: 'review_task',
          subjectId: task.id,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { recordId, stage: task.stage, assigneeUserId: assignee },
        },
        tx,
      );

      return { record: updated, taskId: task.id };
    });
  }

  /** The caller's own task queue (spec §7 `GET /tasks?assigned=me`). */
  async listTasks(
    userId: string,
    query: TaskListQuery,
  ): Promise<{
    data: ReviewTask[];
    pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
  }> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.reviewTask.findMany({
        where: {
          assigneeUserId: userId,
          ...(query.status ? { status: query.status } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: { version: { include: { record: true } } },
      });
      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        data: page.map((row) => this.toTaskDto(row, row.version.record)),
        pagination: {
          nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
          hasMore,
          limit: query.limit,
        },
      };
    });
  }

  /** Task detail: record metadata, version under review, prior decisions. */
  async taskDetail(userId: string, taskId: string): Promise<ReviewTaskDetail> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const task = await tx.reviewTask.findUnique({
        where: { id: taskId },
        include: {
          version: { include: { record: { include: { contributors: true } } } },
          decisions: { include: { reviewer: true }, orderBy: { decidedAt: 'asc' } },
        },
      });
      if (!task) throw new NotFoundException('Task not found.');

      // The assignee, or any member holding task.read in the record's
      // institution (service-side check; the guard cannot know the
      // institution from the URL alone).
      if (task.assigneeUserId !== userId) {
        await this.requireCapability(
          userId,
          'task:read',
          task.version.record.institutionId,
          task.id,
          tx,
        );
      }

      const record = task.version.record;
      const contributors = record.contributors
        .filter((c) => c.userId !== null || c.externalName !== null)
        .map((c) => ({
          displayName: c.externalName ?? c.userId!,
          isSupervision: c.isSupervision,
          ackStatus: c.ackStatus,
        }));

      return {
        ...this.toTaskDto(task, record),
        recordStatus: record.status,
        outputType: record.outputType,
        verificationLevel: record.verificationLevel,
        institutionId: record.institutionId,
        changeSummary: task.version.changeSummary,
        fileName: task.version.fileName,
        scanStatus: task.version.scanStatus,
        contributors,
        priorDecisions: task.decisions.map((d) => ({
          decision: d.decision,
          comment: d.comment,
          decidedAt: d.decidedAt.toISOString(),
          reviewerName: d.reviewer.displayName,
        })),
      };
    });
  }

  /**
   * Record a review decision on an assigned task. The reviewer cannot edit
   * the student's file (no path exists); a return requires a new version to
   * progress; approval advances the stage — and the FINAL stage can only be
   * completed by verification (registry + step-up), never by a task decision.
   */
  async decideTask(
    userId: string,
    taskId: string,
    input: TaskDecisionInput,
  ): Promise<{ recordStatus: string; nextStage: string | null }> {
    const parsed = taskDecisionSchema.parse(input);
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const task = await tx.reviewTask.findUnique({
        where: { id: taskId },
        include: { version: { include: { record: true } }, workflowInstance: { include: { template: true } } },
      });
      if (!task) throw new NotFoundException('Task not found.');
      if (task.status !== 'pending') {
        throw new ConflictException('This task has already been decided.');
      }
      if (task.assigneeUserId !== userId) {
        throw new NotFoundException('Task not found.');
      }
      const record = task.version.record;
      await this.requireCapability(userId, 'task:decide', record.institutionId, task.id, tx);

      const stages = (task.workflowInstance.template.stages as Array<{ name: string; roles: MemberRole[] }>).map(
        (s) => s.name,
      );
      const following = nextStage(stages, task.stage);

      // Human decision first: append-only, with the reviewer's name on it.
      await tx.reviewDecision.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          reviewerUserId: userId,
          versionId: task.versionId,
          decision: parsed.decision,
          comment: parsed.comment ?? '',
          requiredActions: parsed.requiredActions ?? [],
        },
      });
      await tx.reviewTask.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'task.decided',
          subjectType: 'review_task',
          subjectId: task.id,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { decision: parsed.decision, recordId: record.id },
        },
        tx,
      );

      if (parsed.decision === 'approve') {
        if (!following) {
          // The final stage completes only through verification, which is
          // step-up protected (api_spec §7). A plain approval can never
          // mark a record institutionally verified.
          throw new ConflictException(
            'This stage completes through verification (POST /records/:id/verify), which requires step-up confirmation.',
          );
        }
        const roles = (task.workflowInstance.template.stages as Array<{ name: string; roles: MemberRole[] }>).find(
          (s) => s.name === following,
        )!.roles;
        const assignee = await this.pickAssignee(tx, record.institutionId!, roles);
        if (!assignee) {
          throw new ConflictException(
            'No eligible reviewer is available for the next stage. Contact the registry.',
          );
        }
        await tx.workflowInstance.update({
          where: { id: task.workflowInstanceId },
          data: { currentStage: following },
        });
        await tx.reviewTask.create({
          data: {
            id: randomUUID(),
            workflowInstanceId: task.workflowInstanceId,
            versionId: task.versionId,
            assigneeUserId: assignee,
            stage: following,
          },
        });
        const updated = await tx.researchRecord.update({
          where: { id: record.id },
          data: { status: 'in_review' },
        });
        return { recordStatus: updated.status, nextStage: following };
      }

      if (parsed.decision === 'return_for_revision' || parsed.decision === 'request_contribution_correction') {
        // The submitted version stays sealed as historical fact (the DB
        // trigger forbids un-submitting it); progression happens through a
        // NEW version, enforced at resubmission below.
        const updated = await tx.researchRecord.update({
          where: { id: record.id },
          data: { status: 'returned_for_revision' },
        });
        await this.audit.record(
          {
            action: 'record.returned',
            subjectType: 'research_record',
            subjectId: record.id,
            actorUserId: userId,
            institutionId: record.institutionId,
            payload: {
              decision: parsed.decision,
              requiredActions: parsed.requiredActions ?? [],
              versionNo: task.version.versionNo,
            },
          },
          tx,
        );
        return { recordStatus: updated.status, nextStage: null };
      }

      // escalate_integrity: the task escalates; nothing about the record's
      // status changes automatically (PRD §6.5 — humans decide).
      await tx.reviewTask.update({
        where: { id: task.id },
        data: { status: 'escalated' },
      });
      await this.audit.record(
        {
          action: 'integrity.escalated',
          subjectType: 'research_record',
          subjectId: record.id,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { taskId: task.id, comment: parsed.comment ?? '' },
        },
        tx,
      );
      return { recordStatus: record.status, nextStage: null };
    });
  }

  /**
   * Verification (spec §7 `POST /records/:id/verify`): registry/examiner +
   * step-up (route guard). Marks the version under review Institutionally
   * Verified, mints the NXR-ID, seals the version, completes the workflow.
   * Only a VERIFIED institution can grant this status (PRD §6.1).
   */
  async verifyRecord(
    recordId: string,
    userId: string,
    versionId: string,
  ): Promise<{ recordStatus: string; nxrId: string; versionId: string }> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const record = await tx.researchRecord.findUnique({
        where: { id: recordId },
        include: { institution: true },
      });
      if (!record || !record.institutionId) {
        throw new NotFoundException('Record not found.');
      }
      await this.requireCapability(userId, 'record:verify', record.institutionId, recordId, tx);

      if (record.institution!.status !== 'verified') {
        throw new ConflictException(
          'Only verified institutions can confer institutional verification.',
        );
      }
      if (!['submitted', 'in_review', 'resubmitted'].includes(record.status)) {
        throw new ConflictException('This record is not awaiting verification.');
      }

      const instance = await tx.workflowInstance.findUnique({
        where: { recordId },
        include: { template: true, tasks: { where: { status: 'pending' } } },
      });
      if (!instance || instance.isComplete) {
        throw new ConflictException('No active review workflow for this record.');
      }
      const stages = (instance.template.stages as Array<{ name: string; roles: MemberRole[] }>).map(
        (s) => s.name,
      );
      const finalStage = stages[stages.length - 1]!;
      if (instance.currentStage !== finalStage) {
        throw new ConflictException(
          'Verification is only available at the final review stage.',
        );
      }
      const task = instance.tasks.find((t) => t.stage === finalStage);
      if (!task) {
        throw new ConflictException('The final review stage has no pending task.');
      }
      if (task.versionId !== versionId) {
        throw new ConflictException(
          'The version under review does not match. Confirm the version before verifying.',
        );
      }

      const nxrId = await this.mintNxrId(tx);

      // The verification decision is recorded like any other — a human,
      // attributable, append-only.
      await tx.reviewDecision.create({
        data: {
          id: randomUUID(),
          taskId: task.id,
          reviewerUserId: userId,
          versionId,
          decision: 'approve',
          comment: 'Institutional verification conferred.',
          requiredActions: [],
        },
      });
      await tx.reviewTask.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await tx.workflowInstance.update({
        where: { id: instance.id },
        data: { isComplete: true },
      });
      // The version was sealed the moment it was submitted (DB trigger);
      // verification binds to it via the decision row — the sealed content
      // is exactly what was reviewed (PRD §6.3, §11.2).
      const updated = await tx.researchRecord.update({
        where: { id: recordId },
        data: { status: 'institutionally_verified', verificationLevel: 'institutionally_verified', nxrId },
      });

      await this.audit.record(
        {
          action: 'record.verified',
          subjectType: 'research_record',
          subjectId: recordId,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { versionId, nxrId },
        },
        tx,
      );

      return { recordStatus: updated.status, nxrId, versionId };
    });
  }

  /**
   * Integrity escalation initiated outside a task (spec §7
   * `POST /records/:id/escalate-integrity` → 202). Raises the flag for
   * humans; changes nothing automatically.
   */
  async escalateIntegrity(recordId: string, userId: string, reason: string): Promise<Record<string, never>> {
    const ctx = this.tenants.current();
    await this.prisma.withTenant(ctx, async (tx) => {
      const record = await tx.researchRecord.findUnique({ where: { id: recordId } });
      if (!record) throw new NotFoundException('Record not found.');
      if (record.ownerUserId !== userId) {
        await this.requireCapability(userId, 'record:escalate_integrity', record.institutionId, recordId, tx);
      }
      await this.audit.record(
        {
          action: 'integrity.escalated',
          subjectType: 'research_record',
          subjectId: recordId,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { reason },
        },
        tx,
      );
    });
    return {};
  }

  // ── internals ─────────────────────────────────────────────

  private async ensureDefaultTemplate(
    tx: Prisma.TransactionClient,
    institutionId: string,
    outputType: OutputType,
  ): Promise<{ id: string; stages: unknown }> {
    const existing = await tx.workflowTemplate.findFirst({
      where: { institutionId, outputType, isActive: true },
    });
    if (existing) return existing;
    // Named per output type: the unique constraint is (institutionId, name)
    // and institutions may customise workflows per output type later.
    return tx.workflowTemplate.create({
      data: {
        id: randomUUID(),
        institutionId,
        name: `default-${outputType}`,
        outputType,
        stages: DEFAULT_STAGES,
      },
    });
  }

  /** First active member holding one of the stage roles, oldest membership first. */
  private async pickAssignee(
    tx: Prisma.TransactionClient,
    institutionId: string,
    roles: readonly MemberRole[],
  ): Promise<string | null> {
    const membership = await tx.membership.findFirst({
      where: { institutionId, status: 'active', role: { in: [...roles] } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return membership?.userId ?? null;
  }

  /** Sequential per-year NXR id; retried on the (rare) unique collision. */
  private async mintNxrId(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `NXR-${year}-`;
    const taken = await tx.researchRecord.count({ where: { nxrId: { startsWith: prefix } } });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const candidate = formatNxrId(year, taken + attempt);
      const clash = await tx.researchRecord.findUnique({ where: { nxrId: candidate } });
      if (!clash) return candidate;
    }
    // Sequential space exhausted by concurrent mints — fall back to a random
    // slot in the year's range rather than failing the verification.
    return formatNxrId(year, 900_000 + Math.floor(Math.random() * 99_000));
  }

  private async requireCapability(
    userId: string,
    action: 'task:read' | 'task:decide' | 'record:verify' | 'record:escalate_integrity',
    institutionId: string | null,
    subjectId: string,
    tx: Parameters<Parameters<PrismaService['withTenant']>[1]>[0],
  ): Promise<void> {
    // Membership rows are RLS-scoped to the tenant — resolve inside the
    // ambient transaction, where the caller's context is already bound.
    const actor = await this.policies.resolveActor(userId, tx);
    const resource: Resource = { kind: 'record', id: subjectId, institutionId: institutionId ?? undefined };
    const decision = this.engine.authorize(actor, action, resource);
    if (!decision.allowed) {
      // 404-shape: existence of other institutions' records is not disclosed.
      throw new NotFoundException('Not found.');
    }
  }

  private toTaskDto(
    task: {
      id: string;
      stage: string;
      status: TaskStatus;
      dueAt: Date | null;
      createdAt: Date;
      versionId: string;
      version: { versionNo: number };
    },
    record: { id: string; title: string },
  ): ReviewTask {
    return {
      id: task.id,
      recordId: record.id,
      recordTitle: record.title,
      versionId: task.versionId,
      versionNo: task.version.versionNo,
      stage: task.stage,
      status: task.status,
      dueAt: task.dueAt ? task.dueAt.toISOString() : null,
      isOverdue: task.dueAt !== null && task.dueAt.getTime() < Date.now() && task.status === 'pending',
      assignedAt: task.createdAt.toISOString(),
    };
  }
}
