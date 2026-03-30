import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SKIP_TENANT_CHECK = 'skipTenantCheck';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Allow skipping tenant check for public endpoints (e.g. report verification)
    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // No user = auth guard will handle it
      return true;
    }

    // Attach companyId from JWT user to request — services MUST use this
    if (user.companyId) {
      request.companyId = user.companyId;
    }

    // Block header-based companyId injection: ignore any client-supplied
    // X-Company-Id or X-Tenant-Id headers — always use JWT companyId
    if (request.headers['x-company-id'] || request.headers['x-tenant-id']) {
      // Silently override — never trust client headers for tenant
      request.headers['x-company-id'] = user.companyId;
      request.headers['x-tenant-id'] = user.companyId;
    }

    return true;
  }
}
