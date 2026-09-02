import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  loginSchema,
  registerSchema,
  stepUpSchema,
  type LoginInput,
  type RegisterInput,
  type StepUpInput,
  type UserSummary,
} from '@alims/contracts';
import {
  CurrentUser,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from '../../interface/decorators/current-user.decorator';
import { Public } from '../../interface/decorators/public.decorator';
import { RequireAction } from '../../interface/decorators/require-action.decorator';
import { PolicyGuard } from '../../interface/guards/policy.guard';
import { ZodValidationPipe } from '../../interface/pipes/zod-validation.pipe';
import {
  AuthService,
  type AuthSession,
  type MfaEnrollResult,
  type MfaSessionResult,
  type RequestContext,
} from './auth.service';
import { REFRESH_COOKIE_NAME, CookieService } from './cookie.service';

/** Response body for login/refresh — the refresh token travels only in the cookie. */
interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: UserSummary;
  mfaRequired: boolean;
}

/**
 * Auth endpoints — api_specification.md §3.
 *
 * Mutations are rate limited to 5/min per the contract's stricter budget for
 * auth routes (PRD §9.1 resource abuse).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register an account' })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() body: RegisterInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ user: UserSummary; verificationEmailSent: true }> {
    return this.auth.register(body, this.contextOf(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in and open a session' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(body, this.contextOf(req));
    return this.completeSession(session, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate the refresh token' })
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const raw = this.readRefreshCookie(req);
    if (!raw) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    try {
      const session = await this.auth.refresh(raw, this.contextOf(req));
      return this.completeSession(session, res);
    } catch (error) {
      // Clear the cookie so a revoked family cannot be retried in a loop.
      this.cookies.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(req), this.contextOf(req));
    this.cookies.clearRefreshCookie(res);
  }

  @Get('me')
  @UseGuards(PolicyGuard)
  @RequireAction('profile:read_own', { ownerFrom: 'self' })
  @ApiOperation({ summary: 'The authenticated user' })
  async me(@CurrentUser() principal: AuthenticatedUser): Promise<UserSummary> {
    const user = await this.auth.findUserById(principal.userId);
    if (!user) {
      // Token valid but the account is gone — treat as unauthenticated.
      throw new UnauthorizedException('Authentication required.');
    }
    return this.auth.toSummary(user);
  }

  /** MFA enrolment — authenticated. Returns the plaintext secret exactly once. */
  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Enrol a TOTP authenticator' })
  async enrollMfa(@CurrentUser() principal: AuthenticatedUser): Promise<MfaEnrollResult> {
    const user = await this.auth.findUserById(principal.userId);
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.auth.enrollMfa(user);
  }

  /**
   * Complete MFA — the login `mfa_challenge` token (or, on first-time
   * enrolment activation, an `access` token) plus a valid TOTP code mints
   * the real access token (api_specification.md §3).
   */
  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify a TOTP code and complete sign-in' })
  async verifyMfa(
    @Body(new ZodValidationPipe(stepUpSchema)) body: StepUpInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<MfaSessionResult> {
    const presented = this.readBearerToken(req);
    if (!presented) {
      throw new UnauthorizedException('Authentication required.');
    }
    return this.auth.verifyMfa(presented, body.totpCode, this.contextOf(req));
  }

  /**
   * Step-up — an authenticated user proves possession of their authenticator
   * to obtain a short-lived, single-use assertion for high-impact actions
   * (api_specification.md §3, PRD §9.1).
   */
  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Obtain a step-up assertion' })
  async stepUp(
    @Body(new ZodValidationPipe(stepUpSchema)) body: StepUpInput,
    @CurrentUser() principal: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ stepUpToken: string; expiresIn: number }> {
    return this.auth.stepUp(principal.userId, body.totpCode, this.contextOf(req));
  }

  /** Set the rotating refresh cookie and return the JSON body. */
  private completeSession(session: AuthSession, res: Response): SessionResponse {
    this.cookies.setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
      mfaRequired: session.mfaRequired,
    };
  }

  private readRefreshCookie(req: AuthenticatedRequest): string | undefined {
    const cookies = (req as { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE_NAME];
  }

  private contextOf(req: AuthenticatedRequest): RequestContext {
    return {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }

  private readBearerToken(req: AuthenticatedRequest): string | undefined {
    const header = req.headers.authorization;
    if (!header) {
      return undefined;
    }
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : undefined;
  }
}
