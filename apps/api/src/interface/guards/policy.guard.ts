import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import {
  ACTION_REQUIREMENT,
  resourceKindForAction,
  type Actor,
  type PolicyAction,
  type Resource,
} from '../../domain/policy/policy';
import { PolicyEngine } from '../../domain/policy/policy-engine';
import { PolicyService } from '../../domain/policy/policy.service';
import {
  REQUIRE_ACTION_KEY,
  type RequireActionMetadata,
} from '../decorators/require-action.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/**
 * Authorization guard (T-102) — deny by default.
 *
 * Used opt-in on a route with `@UseGuards(PolicyGuard)` and
 * `@RequireAction(...)`. A guarded route with no declared action, or with an
 * action the engine does not know, fails closed.
 *
 * This guard performs the coarse, route-derivable check (role × tenant). For
 * fine-grained checks on an already-loaded resource — ownership of a specific
 * record, draft state, review assignment — services call
 * `PolicyEngine.authorize()` directly with the same entrypoint, so the rules
 * can never diverge between guard and service.
 *
 * Cross-tenant data reads are additionally fenced by PostgreSQL RLS (T-103);
 * this guard is the application-layer half of the boundary, not a substitute.
 */
@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly engine: PolicyEngine,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RequireActionMetadata | undefined>(
      REQUIRE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!metadata?.action) {
      // A guarded route without a declared action is a wiring error. Fail
      // closed — never leave an unguarded authorisation gap.
      this.logger.error(
        `PolicyGuard applied to ${request.method ?? '?'} ${request.originalUrl ?? request.url ?? '?'} without @RequireAction().`,
      );
      throw new ForbiddenException('Insufficient permissions.');
    }

    const { action } = metadata;
    const user = request.user;
    if (!user?.userId) {
      // Guard ordering safety net: this should have been caught by JwtAuthGuard.
      throw new UnauthorizedException('Authentication required.');
    }

    const requirement = ACTION_REQUIREMENT[action];

    // Memberships are only needed for role-scoped capabilities. Self and
    // authenticated actions are decided from the principal alone, saving a
    // query per request on the hot path.
    let actor: Actor = { userId: user.userId, memberships: [] };
    if (requirement?.kind === 'capability') {
      actor = await this.policies.resolveActor(user.userId);
    }

    const resource = this.buildResource(action, metadata, request, user.userId);
    const decision = this.engine.authorize(actor, action, resource);

    if (!decision.allowed) {
      await this.audit.record({
        action: 'policy.denied',
        subjectType: 'policy',
        subjectId: resource.id ?? null,
        actorUserId: user.userId,
        institutionId: resource.institutionId ?? null,
        payload: {
          requestedAction: action,
          resourceKind: resource.kind,
          reason: decision.reason,
        },
        ip: request.ip ?? null,
        userAgent: request.get?.('user-agent') ?? null,
      });

      // The precise reason is logged for operators, never returned: a
      // detailed denial message is an enumeration/information oracle
      // (PRD §9.1, api_spec §1.2).
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }

  /**
   * Assemble the resource descriptor from what the route already exposes —
   * path/body/query — without loading the entity. Anything not derivable here
   * must be supplied by the service when it calls the engine directly.
   */
  private buildResource(
    action: PolicyAction,
    metadata: RequireActionMetadata,
    request: AuthenticatedRequest,
    userId: string,
  ): Resource {
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const kind = resourceKindForAction(action);

    let ownerId: string | undefined;
    if (metadata.ownerFrom === 'self') {
      ownerId = userId;
    } else if (metadata.ownerFrom === 'body') {
      ownerId = this.asString(body.ownerId);
    } else {
      ownerId = params.ownerId ?? this.asString(body.ownerId);
    }

    return {
      kind,
      id: params.id ?? params[`${kind}Id`] ?? this.asString(body.id),
      ownerId,
      institutionId: params.institutionId ?? this.asString(body.institutionId),
      status: this.asString(body.status),
    };
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
