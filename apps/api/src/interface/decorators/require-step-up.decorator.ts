import { SetMetadata } from '@nestjs/common';
import type { StepUpAction } from '@alims/contracts';

export const REQUIRE_STEP_UP_KEY = 'alims:requireStepUp';

/**
 * Declares that a route performs a high-impact action requiring a fresh
 * step-up assertion (PRD §9.1, api_specification.md §3).
 *
 * `StepUpGuard` reads this and demands a valid, unreplayed `X-Step-Up-Token`
 * minted by `POST /auth/step-up`. The action is recorded in the audit trail
 * when the assertion is consumed.
 */
export const RequireStepUp = (action: StepUpAction): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_STEP_UP_KEY, action);
