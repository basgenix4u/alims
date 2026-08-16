import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'alims:isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * Authentication is global and deny-by-default, so this decorator is the
 * only way to open an endpoint. Every use is a security decision and should
 * be justified in review.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
