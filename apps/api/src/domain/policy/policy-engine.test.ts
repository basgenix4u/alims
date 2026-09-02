import { describe, expect, it } from 'vitest';
import type { MemberRole } from '@alims/contracts';
import { PolicyEngine } from './policy-engine';
import {
  ACTION_REQUIREMENT,
  POLICY_ACTIONS,
  ROLE_CAPABILITIES,
  type Actor,
  type ActorMembership,
  type PolicyAction,
  type Resource,
  type ResourceKind,
} from './policy';

const INST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INST_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const engine = new PolicyEngine();

function actor(overrides: Partial<Actor> = {}): Actor {
  return { userId: USER, memberships: [], ...overrides };
}

function membership(
  role: MemberRole,
  institutionId: string = INST_A,
  status: ActorMembership['status'] = 'active',
): ActorMembership {
  return { role, institutionId, status };
}

function resource(overrides: Partial<Resource> & { kind: ResourceKind }): Resource {
  return { ...overrides };
}

describe('PolicyEngine — deny-by-default baseline', () => {
  it('denies an unknown action', () => {
    const decision = engine.authorize(actor(), 'certificate:explode' as PolicyAction, resource({ kind: 'certificate' }));
    expect(decision.allowed).toBe(false);
  });

  it('denies an unknown resource kind', () => {
    const decision = engine.authorize(actor(), 'record:read', resource({ kind: 'not_a_thing' as ResourceKind }));
    expect(decision.allowed).toBe(false);
  });

  it('denies a capability action with no tenant context (fail closed)', () => {
    const decision = engine.authorize(
      actor({ memberships: [membership('registry')] }),
      'certificate:issue',
      resource({ kind: 'certificate' }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: 'Tenant context is required.' });
  });

  it('denies when the membership is pending, not active', () => {
    const decision = engine.authorize(
      actor({ memberships: [membership('registry', INST_A, 'pending')] }),
      'certificate:issue',
      resource({ kind: 'certificate', institutionId: INST_A }),
    );
    expect(decision.allowed).toBe(false);
  });

  it('denies a role acting outside its institution (cross-tenant)', () => {
    const decision = engine.authorize(
      actor({ memberships: [membership('registry', INST_A)] }),
      'certificate:issue',
      resource({ kind: 'certificate', institutionId: INST_B }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: 'Insufficient role.' });
  });
});

describe('PolicyEngine — public, authenticated and platform requirements', () => {
  it('allows public actions for anyone, even without a user id', () => {
    const anon: Actor = { userId: '', memberships: [] };
    expect(engine.authorize(anon, 'public:verify', resource({ kind: 'public' })).allowed).toBe(true);
    expect(engine.authorize(anon, 'public:search', resource({ kind: 'public' })).allowed).toBe(true);
  });

  it('allows authenticated actions for a signed-in user', () => {
    expect(engine.authorize(actor(), 'record:create', resource({ kind: 'record' })).allowed).toBe(true);
    expect(engine.authorize(actor(), 'access:request', resource({ kind: 'access' })).allowed).toBe(true);
  });

  it('denies authenticated actions for an anonymous actor', () => {
    const anon: Actor = { userId: '', memberships: [] };
    expect(engine.authorize(anon, 'record:create', resource({ kind: 'record' })).allowed).toBe(false);
  });

  it('reserves institution status changes for platform admins', () => {
    const withMemberships = actor({ memberships: [membership('inst_admin')] });
    expect(
      engine.authorize(withMemberships, 'institution:set_status', resource({ kind: 'institution', institutionId: INST_A }))
        .allowed,
    ).toBe(false);

    const platform = actor({ platformAdmin: true });
    expect(engine.authorize(platform, 'institution:set_status', resource({ kind: 'institution' })).allowed).toBe(true);
  });
});

describe('PolicyEngine — self and self_draft requirements', () => {
  it('allows the owner to act on their own resource', () => {
    const a = actor();
    expect(engine.authorize(a, 'record:submit', resource({ kind: 'record', ownerId: USER })).allowed).toBe(true);
    expect(engine.authorize(a, 'record:withdraw', resource({ kind: 'record', ownerId: USER })).allowed).toBe(true);
  });

  it('denies a non-owner', () => {
    const a = actor();
    const decision = engine.authorize(a, 'record:submit', resource({ kind: 'record', ownerId: OTHER }));
    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ reason: 'Only the resource owner may perform this action.' });
  });

  it('denies self actions when the owner is unknown (fail closed)', () => {
    const a = actor();
    expect(engine.authorize(a, 'profile:update', resource({ kind: 'profile' })).allowed).toBe(false);
  });

  it('allows editing only an owned draft (PRD §7.1)', () => {
    const a = actor();
    expect(engine.authorize(a, 'record:update', resource({ kind: 'record', ownerId: USER, status: 'draft' })).allowed).toBe(true);
    expect(engine.authorize(a, 'record:update', resource({ kind: 'record', ownerId: USER, status: 'published' })).allowed).toBe(false);
    expect(engine.authorize(a, 'record:update', resource({ kind: 'record', ownerId: USER })).allowed).toBe(false);
    expect(engine.authorize(a, 'record:update', resource({ kind: 'record', ownerId: OTHER, status: 'draft' })).allowed).toBe(false);
  });
});

describe('PolicyEngine — role capabilities (all 7 PRD roles)', () => {
  it('grants a role its capabilities within its own tenant', () => {
    const registry = actor({ memberships: [membership('registry')] });
    expect(
      engine.authorize(registry, 'certificate:issue', resource({ kind: 'certificate', institutionId: INST_A })).allowed,
    ).toBe(true);
    expect(
      engine.authorize(registry, 'certificate:revoke', resource({ kind: 'certificate', institutionId: INST_A })).allowed,
    ).toBe(true);
    expect(
      engine.authorize(registry, 'member:invite', resource({ kind: 'member', institutionId: INST_A })).allowed,
    ).toBe(true);
  });

  it('lets the owner read their own record even without a staff role', () => {
    const student = actor({ memberships: [] });
    expect(
      engine.authorize(student, 'record:read', resource({ kind: 'record', ownerId: USER, institutionId: INST_A })).allowed,
    ).toBe(true);
  });

  it('requires a staff role for reading another person’s record', () => {
    const student = actor({ memberships: [membership('student')] });
    const decision = engine.authorize(
      student,
      'record:read',
      resource({ kind: 'record', ownerId: OTHER, institutionId: INST_A }),
    );
    expect(decision.allowed).toBe(false);
  });

  it('denies a supervisor the final institutional verification (PRD §4.2 may-not)', () => {
    const supervisor = actor({ memberships: [membership('supervisor')] });
    expect(
      engine.authorize(supervisor, 'record:verify', resource({ kind: 'record', institutionId: INST_A })).allowed,
    ).toBe(false);
  });

  it('denies a librarian member management (PRD §4.4 may-not)', () => {
    const librarian = actor({ memberships: [membership('librarian')] });
    expect(
      engine.authorize(librarian, 'member:invite', resource({ kind: 'member', institutionId: INST_A })).allowed,
    ).toBe(false);
    expect(
      engine.authorize(librarian, 'metadata:curate', resource({ kind: 'record', institutionId: INST_A })).allowed,
    ).toBe(true);
  });

  it('denies a student certificate issuance (PRD §4.1 may-not)', () => {
    const student = actor({ memberships: [membership('student')] });
    expect(
      engine.authorize(student, 'certificate:issue', resource({ kind: 'certificate', institutionId: INST_A })).allowed,
    ).toBe(false);
  });

  it('grants examiner verification and denies dept_admin certificate issuance', () => {
    const examiner = actor({ memberships: [membership('examiner')] });
    expect(engine.authorize(examiner, 'record:verify', resource({ kind: 'record', institutionId: INST_A })).allowed).toBe(true);

    const deptAdmin = actor({ memberships: [membership('dept_admin')] });
    expect(engine.authorize(deptAdmin, 'task:assign', resource({ kind: 'task', institutionId: INST_A })).allowed).toBe(true);
    expect(
      engine.authorize(deptAdmin, 'certificate:issue', resource({ kind: 'certificate', institutionId: INST_A })).allowed,
    ).toBe(false);
  });

  it('grants inst_admin structure and member management', () => {
    const admin = actor({ memberships: [membership('inst_admin')] });
    expect(engine.authorize(admin, 'department:manage', resource({ kind: 'department', institutionId: INST_A })).allowed).toBe(true);
    expect(engine.authorize(admin, 'member:update', resource({ kind: 'member', institutionId: INST_A })).allowed).toBe(true);
    expect(engine.authorize(admin, 'audit:read', resource({ kind: 'audit', institutionId: INST_A })).allowed).toBe(true);
  });

  it('authorises similarity reads only for review roles', () => {
    const supervisor = actor({ memberships: [membership('supervisor')] });
    expect(engine.authorize(supervisor, 'similarity:read', resource({ kind: 'similarity', institutionId: INST_A })).allowed).toBe(true);

    const student = actor({ memberships: [membership('student')] });
    expect(engine.authorize(student, 'similarity:read', resource({ kind: 'similarity', institutionId: INST_A })).allowed).toBe(false);
  });
});

describe('PolicyEngine — completeness invariants', () => {
  it('encodes all 7 PRD roles', () => {
    expect(Object.keys(ROLE_CAPABILITIES).sort()).toEqual(
      (['student', 'supervisor', 'dept_admin', 'examiner', 'registry', 'librarian', 'inst_admin'] as MemberRole[]).sort(),
    );
  });

  it('maps every declared action to a requirement', () => {
    for (const action of POLICY_ACTIONS) {
      expect(ACTION_REQUIREMENT[action], `missing requirement for ${action}`).toBeDefined();
    }
  });

  it('every required capability is granted to at least one role', () => {
    const allGranted = new Set<string>();
    for (const granted of Object.values(ROLE_CAPABILITIES)) {
      for (const capability of granted) {
        allGranted.add(capability);
      }
    }
    for (const requirement of Object.values(ACTION_REQUIREMENT)) {
      if (requirement.kind === 'capability') {
        expect(allGranted.has(requirement.capability), `no role grants ${requirement.capability}`).toBe(true);
      }
    }
  });
});
