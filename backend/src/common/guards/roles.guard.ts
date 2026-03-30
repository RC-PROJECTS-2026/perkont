import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Kullanıcının rollerini diziye çevir
    const userRoles: string[] = user.roles
      ? String(user.roles).split(',').map((r: string) => r.trim())
      : [user.role || ''];

    // Admin her şeye erişebilir
    if (userRoles.includes(UserRole.ADMIN)) return true;

    // Kullanıcının rollerinden herhangi biri gerekli rollerden birine uyuyorsa erişim ver
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
