import { Injectable } from '@nestjs/common';
import {
  ACTION_REQUIREMENT,
  RESOURCE_KINDS,
  ROLE_CAPABILITIES,
  type Actor,
  type PolicyAction,
  type PolicyDecision,
  type PolicyRequirement,
  type Resource,
} from './policy';

/** Denial reasons — safe plain language, never internals (PRD §9.1). */
const REASONS = {
  unknownAction: 'Unknown action.',
  unknownResource: 'Unknown resource type.',
  notAuthenticated: 'Authentication required.',
  platformAdminOnly: 'Platform administration is required.',
  notOwner: 'Only the resource owner may perform this action.',
  notEditable: 'The record is not in an editable state.',
  tenantRequired: 'Tenant context is required.',
  insufficientRole: 'Insufficient role.',
} as const;

/**
 * The single authorization entrypoint (T-102).
 *
 * `authorize(actor, action, resource)` is called by the PolicyGuard for
 * coarse, route-derivable checks and by services for fine-grained checks on
 * already-loaded resources. Both paths use this class, so the rules can
 * never diverge.
 *
 * Deny-by-default properties, each covered by tests:
 *  - unknown action        → deny
 *  - unknown resource kind → deny
 *  - missing owner / tenant context → deny (fail closed)
 *  - unknown or inactive membership  → deny
 */
@Injectable()
export class PolicyEngine {
  authorize(actor: Actor, action: PolicyAction, resource: Resource): PolicyDecision {
    const requirement: PolicyRequirement | undefined = ACTION_REQUIREMENT[action];
    if (requirement === undefined) {
      return { allowed: false, reason: REASONS.unknownAction };
    }

    if (!(RESOURCE_KINDS as readonly string[]).includes(resource.kind)) {
      return { allowed: false, reason: REASONS.unknownResource };
    }

    switch (requirement.kind) {
      case 'anyone':
        return { allowed: true };
      case 'authenticated':
        return actor.userId.length > 0
          ? { allowed: true }
          : { allowed: false, reason: REASONS.notAuthenticated };
      case 'platform_admin':
        return actor.platformAdmin === true
          ? { allowed: true }
          : { allowed: false, reason: REASONS.platformAdminOnly };
      case 'self':
        return this.checkSelf(actor, resource);
      case 'self_draft':
        return this.checkSelfDraft(actor, resource);
      case 'capability':
        return this.checkCapability(actor, requirement, resource);
    }
  }

  private checkSelf(actor: Actor, resource: Resource): PolicyDecision {
    if (!resource.ownerId || resource.ownerId !== actor.userId) {
      return { allowed: false, reason: REASONS.notOwner };
    }
    return { allowed: true };
  }

  private checkSelfDraft(actor: Actor, resource: Resource): PolicyDecision {
    if (!resource.ownerId || resource.ownerId !== actor.userId) {
      return { allowed: false, reason: REASONS.notOwner };
    }
    // PRD §7.1: only a draft can be edited. Absent status fails closed.
    if (resource.status !== 'draft') {
      return { allowed: false, reason: REASONS.notEditable };
    }
    return { allowed: true };
  }

  private checkCapability(
    actor: Actor,
    requirement: Extract<PolicyRequirement, { kind: 'capability' }>,
    resource: Resource,
  ): PolicyDecision {
    // The owner always acts on their own resource when the action permits.
    if (requirement.selfFallback && resource.ownerId === actor.userId) {
      return { allowed: true };
    }

    // Role-scoped capabilities are always tenant-scoped. Without a tenant,
    // there is no scope to prove — fail closed rather than allow globally.
    if (!resource.institutionId) {
      return { allowed: false, reason: REASONS.tenantRequired };
    }

    for (const membership of actor.memberships) {
      if (membership.status !== 'active') {
        continue;
      }
      if (membership.institutionId !== resource.institutionId) {
        continue;
      }
      const granted = ROLE_CAPABILITIES[membership.role];
      if (granted?.has(requirement.capability)) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: REASONS.insufficientRole };
  }
}
