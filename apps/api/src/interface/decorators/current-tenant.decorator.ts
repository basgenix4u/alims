import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { SYSTEM_CONTEXT, type TenantContext } from '../../infrastructure/database/prisma.service';
import type { TenantAwareRequest } from '../guards/tenant.guard';

/**
 * Injects the tenant context resolved for the current request (T-103).
 *
 * Defaults to the system context when no tenant was claimed or the route is
 * public. Handlers should pass this to `PrismaService.withTenant()` rather
 * than trusting client-supplied ids.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<TenantAwareRequest>();
    return request.tenantContext ?? SYSTEM_CONTEXT;
  },
);
