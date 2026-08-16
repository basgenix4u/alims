import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from '../../modules/auth/token.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Deny-by-default authentication (PRD §9.1, OWASP API2).
 *
 * Registered globally in AppModule, so every route requires a valid access
 * token unless explicitly marked @Public(). Opt-out is safer than opt-in: a
 * forgotten decorator yields a locked endpoint, not an open one.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      // Purpose 'access' only: an mfa_challenge or step_up token presented
      // here is rejected, so neither can bypass the second factor.
      const claims = await this.tokens.verifyToken(token, 'access');
      request.user = { userId: claims.sub, sessionId: claims.sid ?? null };
      return true;
    } catch {
      // Uniform message: never reveal expired vs malformed vs wrong purpose.
      throw new UnauthorizedException('Authentication required.');
    }
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    return value.trim();
  }
}
