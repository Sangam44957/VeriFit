import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser, UserRole } from '../types/index.js';
import { ALLOW_ROLES_KEY } from '../decorators/allow-roles.decorator.js';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ALLOW_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowed || allowed.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;

    if (!user) throw new ForbiddenException('No authenticated user');
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} is not permitted`);
    }

    return true;
  }
}
