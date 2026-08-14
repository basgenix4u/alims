import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../../config/env';

/** Contract §1: the refresh token lives in the `alims_rt` cookie. */
export const REFRESH_COOKIE_NAME = 'alims_rt';

@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Cookie hardening (PRD §9.1, OWASP A01/A05):
   *
   * - httpOnly  — JavaScript cannot read it, so XSS cannot exfiltrate the session.
   * - secure    — HTTPS only; blocks network interception.
   * - sameSite=strict — the cookie is never sent cross-site, which is the
   *   primary CSRF defence for the refresh endpoint.
   * - path=/api/v1/auth — the browser only attaches it to auth routes, so it
   *   is not broadcast on every API call.
   */
  private baseOptions(): CookieOptions {
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: '/api/v1/auth',
      ...(domain ? { domain } : {}),
    };
  }

  setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, token, { ...this.baseOptions(), expires: expiresAt });
  }

  /** Options must match those used to set it, or the browser keeps the cookie. */
  clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions());
  }
}
