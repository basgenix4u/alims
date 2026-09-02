import type { MemberRole } from '@alims/contracts';

/**
 * Central authorization vocabulary (T-102).
 *
 * Every authorization decision in ALIMS flows through
 * `PolicyEngine.authorize(actor, action, resource)` — a single entrypoint
 * that is deny-by-default: an action or resource the engine does not know is
 * denied, and a role is granted nothing it is not explicitly given.
 *
 * PRD §9.1: authorization is server-side only. The web app must contain no
 * authorization logic; it may only reflect what the API tells it.
 *
 * Roles and their "may / may-not" rules come from PRD §4.1–§4.7 and the
 * `MemberRole` vocabulary in api_specification.md §2.
 */

/** Resource kinds the engine understands. Anything else is denied. */
export const RESOURCE_KINDS = [
  'record',
  'version',
  'upload',
  'task',
  'similarity',
  'certificate',
  'institution',
  'department',
  'programme',
  'session',
  'member',
  'workflow',
  'access',
  'metadata',
  'metrics',
  'audit',
  'dispute',
  'profile',
  'public',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * Every protected action in Release 1.
 *
 * Naming is `<resource>:<verb>`. Actions not listed here are unknown to the
 * engine and therefore denied — a typo in a decorator locks a route instead
 * of opening it.
 */
export const POLICY_ACTIONS = [
  // Research records — PRD §6.2, §7.1 · api_spec §5
  'record:create',
  'record:read',
  'record:update',
  'record:submit',
  'record:withdraw',
  'record:verify',
  'record:manage_access',
  'record:escalate_integrity',
  // Versions & uploads — PRD §6.3 · api_spec §6
  'version:create',
  'version:read',
  'version:download',
  'upload:create',
  // Review workflow — PRD §6.5 · api_spec §7
  'task:read',
  'task:decide',
  'task:assign',
  'similarity:read',
  'similarity:review',
  // Certificates — PRD §6.4 · api_spec §8
  'certificate:issue',
  'certificate:revoke',
  'certificate:read',
  // Institutions, structure & members — PRD §6.1 · api_spec §4
  'institution:create',
  'institution:read',
  'institution:update',
  'institution:set_status',
  'department:manage',
  'programme:manage',
  'session:manage',
  'member:list',
  'member:invite',
  'member:update',
  'member:revoke',
  'workflow:manage',
  // Access & embargo — PRD §6.6 · api_spec §9
  'access:request',
  'access:decide',
  // Metadata curation — PRD §4.4
  'metadata:curate',
  // Institution metrics — PRD §10.1
  'metrics:read',
  // Audit trail — PRD §9.1
  'audit:read',
  // Disputes — PRD §7.3 · api_spec §15
  'dispute:raise',
  'dispute:manage',
  // Own profile
  'profile:read_own',
  'profile:update',
  // Public surfaces — api_spec §13 · unauthenticated narrow projections
  'public:search',
  'public:read_record',
  'public:verify',
] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

/** One active membership: the role an actor holds within an institution. */
export interface ActorMembership {
  role: MemberRole;
  institutionId: string;
  status: 'active' | 'pending';
}

/**
 * The principal performing an action.
 *
 * Roles are resolved fresh from the membership table on every request, never
 * carried in the JWT, so a revoked role takes effect immediately rather than
 * at token expiry.
 */
export interface Actor {
  userId: string;
  memberships: ActorMembership[];
  /**
   * Platform-level authority, outside the institution membership model.
   * Only Agent 5's platform identity (api_spec §4 `PATCH /institutions/:id/status`)
   * may set this. No membership role grants it.
   */
  platformAdmin?: boolean;
}

/** The thing being acted on. Fields are optional; absent context fails closed. */
export interface Resource {
  kind: ResourceKind;
  /** Entity id, e.g. a record id. */
  id?: string;
  /** User id that owns the resource (e.g. a record's owner). */
  ownerId?: string;
  /** Institution the resource belongs to. Required for role-scoped actions. */
  institutionId?: string;
  /** Resource status (e.g. a record's `status`) for state-guarded actions. */
  status?: string;
}

/** A decision. Denial reasons are safe plain language (PRD §9.1). */
export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * The institution-scoped capabilities a role can hold. Granting one is a
 * deliberate "may do" (PRD §4); anything not granted is a "may not do".
 */
export const CAPABILITIES = [
  'record.read',
  'record.verify',
  'task.read',
  'task.decide',
  'task.assign',
  'similarity.read',
  'certificate.issue',
  'certificate.revoke',
  'certificate.read',
  'member.read',
  'member.manage',
  'institution.manage',
  'structure.manage',
  'workflow.manage',
  'metrics.read',
  'metadata.curate',
  'access.manage',
  'audit.read',
  'dispute.manage',
  'integrity.escalate',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

function capSet(...caps: Capability[]): ReadonlySet<Capability> {
  return new Set(caps);
}

/**
 * The 7 PRD roles and exactly what each may do within an institution.
 * PRD §4.1 student, §4.2 supervisor, §4.3 dept_admin/examiner/registry,
 * §4.4 librarian, §6.1 inst_admin.
 *
 * Everything else is denied by default.
 */
export const ROLE_CAPABILITIES: Record<MemberRole, ReadonlySet<Capability>> = {
  // §4.1 Student: acts only on their own resources via self/authenticated
  // requirements; holds no institution-wide staff capability.
  student: capSet(),
  // §4.2 Supervisor: review assigned work; escalate integrity concerns.
  supervisor: capSet('task.read', 'task.decide', 'similarity.read', 'integrity.escalate'),
  // §4.3 Department administrator: run the local workflow, assign reviewers.
  dept_admin: capSet(
    'record.read',
    'task.read',
    'task.decide',
    'task.assign',
    'similarity.read',
    'integrity.escalate',
    'workflow.manage',
    'metrics.read',
    'member.read',
  ),
  // §4.3 Examiner: review assigned records and verify institution facts.
  examiner: capSet(
    'record.read',
    'record.verify',
    'task.read',
    'task.decide',
    'similarity.read',
    'integrity.escalate',
  ),
  // §4.3 Registry officer: verify, issue/revoke certificates, manage members.
  registry: capSet(
    'record.read',
    'record.verify',
    'task.read',
    'task.decide',
    'task.assign',
    'similarity.read',
    'integrity.escalate',
    'certificate.issue',
    'certificate.revoke',
    'certificate.read',
    'member.read',
    'member.manage',
    'workflow.manage',
    'metadata.curate',
    'metrics.read',
  ),
  // §4.4 Librarian / repository manager: metadata quality and access policy.
  librarian: capSet('record.read', 'metadata.curate', 'access.manage', 'dispute.manage', 'certificate.read'),
  // §6.1 Institution administrator: own the institution, its structure and members.
  inst_admin: capSet(
    'record.read',
    'task.read',
    'certificate.read',
    'member.read',
    'member.manage',
    'institution.manage',
    'structure.manage',
    'workflow.manage',
    'metrics.read',
    'access.manage',
    'audit.read',
    'dispute.manage',
  ),
};

/**
 * What each action requires.
 *
 * `capability` requirements are institution-scoped: the actor must hold the
 * capability in the resource's institution. `selfFallback` additionally lets
 * the resource owner act on their own resource.
 */
export type PolicyRequirement =
  | { kind: 'anyone' }
  | { kind: 'authenticated' }
  | { kind: 'platform_admin' }
  | { kind: 'self' }
  | { kind: 'self_draft' }
  | { kind: 'capability'; capability: Capability; selfFallback?: boolean };

export const ACTION_REQUIREMENT: Record<PolicyAction, PolicyRequirement> = {
  'record:create': { kind: 'authenticated' },
  'record:read': { kind: 'capability', capability: 'record.read', selfFallback: true },
  // PRD §7.1: only a draft can be directly edited, and only by its owner.
  'record:update': { kind: 'self_draft' },
  'record:submit': { kind: 'self' },
  'record:withdraw': { kind: 'self' },
  // api_spec §7: registry/examiner + step-up (step-up is enforced at the route).
  'record:verify': { kind: 'capability', capability: 'record.verify' },
  'record:manage_access': { kind: 'capability', capability: 'access.manage', selfFallback: true },
  'record:escalate_integrity': { kind: 'capability', capability: 'integrity.escalate' },

  'version:create': { kind: 'self' },
  'version:read': { kind: 'capability', capability: 'record.read', selfFallback: true },
  'version:download': { kind: 'capability', capability: 'record.read', selfFallback: true },
  'upload:create': { kind: 'self' },

  'task:read': { kind: 'capability', capability: 'task.read' },
  'task:decide': { kind: 'capability', capability: 'task.decide' },
  'task:assign': { kind: 'capability', capability: 'task.assign' },
  // api_spec §7: authorised roles only; anything else gets 404, not 403.
  'similarity:read': { kind: 'capability', capability: 'similarity.read' },
  'similarity:review': { kind: 'capability', capability: 'similarity.read' },

  // api_spec §8: registry + step-up.
  'certificate:issue': { kind: 'capability', capability: 'certificate.issue' },
  'certificate:revoke': { kind: 'capability', capability: 'certificate.revoke' },
  'certificate:read': { kind: 'capability', capability: 'certificate.read', selfFallback: true },

  // api_spec §4: applying to onboard an institution is open to any account.
  'institution:create': { kind: 'authenticated' },
  'institution:read': { kind: 'authenticated' },
  'institution:update': { kind: 'capability', capability: 'institution.manage' },
  // api_spec §4: platform admin + X-Step-Up-Token. No membership role qualifies.
  'institution:set_status': { kind: 'platform_admin' },

  'department:manage': { kind: 'capability', capability: 'structure.manage' },
  'programme:manage': { kind: 'capability', capability: 'structure.manage' },
  'session:manage': { kind: 'capability', capability: 'structure.manage' },

  'member:list': { kind: 'capability', capability: 'member.read' },
  'member:invite': { kind: 'capability', capability: 'member.manage' },
  // api_spec §4: role/status change — step-up required at the route.
  'member:update': { kind: 'capability', capability: 'member.manage' },
  'member:revoke': { kind: 'capability', capability: 'member.manage' },

  'workflow:manage': { kind: 'capability', capability: 'workflow.manage' },

  'access:request': { kind: 'authenticated' },
  'access:decide': { kind: 'capability', capability: 'access.manage' },

  'metadata:curate': { kind: 'capability', capability: 'metadata.curate' },

  'metrics:read': { kind: 'capability', capability: 'metrics.read' },

  'audit:read': { kind: 'capability', capability: 'audit.read' },

  'dispute:raise': { kind: 'authenticated' },
  'dispute:manage': { kind: 'capability', capability: 'dispute.manage' },

  'profile:read_own': { kind: 'self' },
  'profile:update': { kind: 'self' },

  'public:search': { kind: 'anyone' },
  'public:read_record': { kind: 'anyone' },
  'public:verify': { kind: 'anyone' },
};

/** The resource kind implied by an action's `<kind>:` prefix. */
export function resourceKindForAction(action: PolicyAction): ResourceKind {
  return action.split(':')[0] as ResourceKind;
}
