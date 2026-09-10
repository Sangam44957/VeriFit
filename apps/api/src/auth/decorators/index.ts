import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole, AuthenticatedUser } from '@verifit/auth';
import { ALLOWED_ROLES_KEY } from '../guards/index.js';

export const IS_PUBLIC_KEY = 'is_public' as const;
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AllowRoles = (...roles: UserRole[]) => SetMetadata(ALLOWED_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw new UnauthorizedException('No authenticated user on request');
    return user;
  },
);
