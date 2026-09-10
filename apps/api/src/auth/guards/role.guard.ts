import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@verifit/auth';

export const ALLOWED_ROLES_KEY = 'allowed_roles' as const;

@Injectable()
export class RoleGuard implements CanActivate {
  private readonly logger = new Logger(RoleGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Handler metadata overrides controller metadata.
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ALLOWED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role restriction on this route — authentication is still required
    // (AuthGuard must run first), but no additional role check applies.
    if (!allowedRoles || allowedRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      // RoleGuard was applied without AuthGuard — fail closed.
      this.logger.error('RoleGuard: no authenticated principal on request');
      throw new ForbiddenException('Authentication required before role check');
    }

    if (!allowedRoles.includes(user.role)) {
      this.logger.warn(
        `Role denied: user=${user.id} role=${user.role} required=${allowedRoles.join('|')}`,
      );
      throw new ForbiddenException(
        `Role ${user.role} is not permitted. Required: ${allowedRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
