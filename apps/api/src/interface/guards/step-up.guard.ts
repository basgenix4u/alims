import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StepUpAction } from '@alims/contracts';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { TokenService, type AccessTokenClaims } from '../../modules/auth/token.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { REQUIRE_STEP_UP_KEY } from '../decorators/require-step-up.decorator';

export const STEP_UP_HEADER = 'x-step-up-token';

/**
 * Enforces a fresh step-up assertion on high-impact actions (T-101).
 *
 * Opt-in: apply with `@UseGuards(StepUpGuard)` + `@RequireStepUp(action)`.
 * The route must already be authenticated (JwtAuthGuard runs first), and the
 * presented step-up token must:
 *
 *   - be a valid `step_up`-purpose JWT (expiry is asserted on verify),
 *   - belong to the authenticated user (`sub` match — a stolen token for
 *     another account is useless),
 *   - carry a `jti`, and not have been consumed before (single-use).
 *
 * Consumption is recorded in the append-only audit trail, so a replayed
 * assertion is both rejected and permanently logged (PRD §9.1).
 *
 * Host modules must import AuthModule so TokenService resolves.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  private readonly logger = new Logger(StepUpGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<StepUpAction | undefined>(REQUIRE_STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!action) {
      // A guarded route without a declared step-up action is a wiring error.
      this.logger.error(
        `StepUpGuard applied to ${request.method ?? '?'} ${request.originalUrl ?? request.url ?? '?'} without @RequireStepUp().`,
      );
      throw new ForbiddenException('Insufficient permissions.');
    }

    const user = request.user;
    if (!user?.userId) {
      throw new UnauthorizedException('Authentication required.');
    }

    const raw = this.readHeader(request);
    if (!raw) {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    let claims: AccessTokenClaims;
    try {
      // Expiry, signature and purpose are all asserted here.
      claims = await this.tokens.verifyToken(raw, 'step_up');
    } catch {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    if (claims.sub !== user.userId) {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    if (!claims.jti) {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    // Action-scoped assertions (minted with an explicit action) may only
    // authorise that action; unscoped assertions pass through.
    if (claims.act && claims.act !== action) {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    if (await this.audit.eventExists('auth.step_up.consumed', claims.jti)) {
      throw new ForbiddenException('Step-up verification is required for this action.');
    }

    await this.audit.record({
      action: 'auth.step_up.consumed',
      subjectType: 'step_up_token',
      subjectId: claims.jti,
      actorUserId: claims.sub,
      payload: { action },
    });

    return true;
  }

  private readHeader(request: AuthenticatedRequest): string | undefined {
    const header = request.headers?.[STEP_UP_HEADER];
    const value = Array.isArray(header) ? header[0] : header;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
