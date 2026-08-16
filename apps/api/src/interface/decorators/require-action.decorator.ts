import { SetMetadata } from '@nestjs/common';
import type { PolicyAction } from '../../domain/policy/policy';

export const REQUIRE_ACTION_KEY = 'alims:requireAction';

export interface RequireActionMetadata {
  action: PolicyAction;
  /**
   * Where the resource `ownerId` comes from.
   * - `'self'`: the authenticated user is the owner (profile endpoints).
   * - `'params'` (default): a path/query parameter such as `ownerId`.
   * - `'body'`: a request-body field such as `ownerId`.
   *
   * Entity-scoped self actions (e.g. editing a specific record) are resolved
   * by the owning service, which calls `PolicyEngine.authorize()` with the
   * loaded record — the guard cannot know a foreign record's owner.
   */
  ownerFrom?: 'self' | 'params' | 'body';
}

/**
 * Declares the policy action a route performs.
 *
 * `PolicyGuard` reads this and calls `PolicyEngine.authorize()`. An unknown
 * action string (e.g. a typo) is denied by the engine, so a route can never
 * silently open because its action was misspelt.
 */
export const RequireAction = (
  action: PolicyAction,
  options: Omit<RequireActionMetadata, 'action'> = {},
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ACTION_KEY, { action, ...options } satisfies RequireActionMetadata);
