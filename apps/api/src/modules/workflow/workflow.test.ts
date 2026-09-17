import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGES,
  formatNxrId,
  nextStage,
} from './application/workflow.service';
import { taskDecisionSchema } from '@alims/contracts';

/** Pure workflow logic: stage advancement, NXR formatting, decision rules. */

describe('workflow stage advancement', () => {
  const stages = DEFAULT_STAGES.map((s) => s.name);

  it('the default flow is supervisor review then registry verification', () => {
    expect(stages).toEqual(['supervisor-review', 'registry-verification']);
  });

  it('advances from the first stage to the final stage', () => {
    expect(nextStage(stages, 'supervisor-review')).toBe('registry-verification');
  });

  it('the final stage has no successor — only verification completes it', () => {
    expect(nextStage(stages, 'registry-verification')).toBeNull();
  });

  it('an unknown stage never advances (fail closed)', () => {
    expect(nextStage(stages, 'does-not-exist')).toBeNull();
  });
});

describe('nxr id formatting', () => {
  it('mints per-year sequential ids, zero-padded to six digits', () => {
    expect(formatNxrId(2026, 1)).toBe('NXR-2026-000001');
    expect(formatNxrId(2026, 421337)).toBe('NXR-2026-421337');
  });
});

describe('task decision validation (spec §7)', () => {
  it('approves without a comment', () => {
    expect(taskDecisionSchema.parse({ decision: 'approve' })).toEqual({
      decision: 'approve',
    });
  });

  it('a return requires a substantive comment', () => {
    expect(
      taskDecisionSchema.safeParse({ decision: 'return_for_revision', comment: 'too short' })
        .success,
    ).toBe(false);
    expect(
      taskDecisionSchema.parse({
        decision: 'return_for_revision',
        comment: 'The methodology section needs a clear data-source statement.',
      }).decision,
    ).toBe('return_for_revision');
  });

  it('records required actions alongside a return', () => {
    const parsed = taskDecisionSchema.parse({
      decision: 'request_contribution_correction',
      comment: 'Contributor list does not match the title page.',
      requiredActions: ['Add the second supervisor', 'Confirm the CRediT roles'],
    });
    expect(parsed.requiredActions).toHaveLength(2);
  });

  it('rejects unknown decision types', () => {
    expect(
      taskDecisionSchema.safeParse({ decision: 'auto_approve' }).success,
    ).toBe(false);
  });
});
