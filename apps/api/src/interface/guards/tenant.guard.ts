import { CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../infrastructure/database/prisma.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { TenantContextService } from '../middleware/tenant-context.service';

/** An {@link AuthenticatedRequest} that also carries the resolved tenant. */
export interface TenantAwareRequest extends AuthenticatedRequest {
  tenantContext?: TenantContext;
}

/**
 * Resolves and sets the tenant context for the current request (T-103).
 *
 * Registered globally after JwtAuthGuard, so `request.user` is already
 * attached. Public routes carry no user and are left in the system context.
 *
 * The database enforces isolation via RLS; this guard only chooses the
 * context, and refuses to let a user claim an institution they do not belong
 * to. It never issues a plain `SET` — queries must run through
 * `PrismaService.withTenant()` (or `TenantContextService.scoped()`), which
 * applies the context transaction-locally so it cannot leak across pooled
 * connections.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantAwareRequest>();
    const user = request.user;

    if (!user?.userId) {
      // Public route: no tenant context to resolve. The system context
      // (set by the middleware store) stands — RLS denies tenant rows.
      return true;
    }

    const claimed = this.tenants.claimFrom(request);
    const tenantContext = await this.tenants.resolve(user.userId, claimed);
    this.tenants.set(tenantContext);
    request.tenantContext = tenantContext;
    return true;
  }
}
