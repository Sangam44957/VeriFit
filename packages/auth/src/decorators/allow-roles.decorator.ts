import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../types/index.js';

export const ALLOW_ROLES_KEY = 'allowRoles';

export const AllowRoles = (...roles: UserRole[]) => SetMetadata(ALLOW_ROLES_KEY, roles);
