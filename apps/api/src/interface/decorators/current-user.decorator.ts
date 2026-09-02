import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The authenticated principal, attached by JwtAuthGuard.
 *
 * Deliberately minimal: identity only. Permissions are resolved server-side
 * by the policy engine (T-102), never carried in the token, so a revoked
 * role takes effect immediately rather than at token expiry.
 */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Injects the authenticated user into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
