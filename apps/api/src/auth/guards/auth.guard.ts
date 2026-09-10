import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { JwtService } from '@verifit/auth';
import type { AuthenticatedUser } from '@verifit/auth';
import { AuthRepository } from '@verifit/database';
import { IS_PUBLIC_KEY } from '../decorators/index.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload;
    try {
      payload = this.jwtService.verifyToken(token);
    } catch {
      this.logger.warn(`JWT verification failed: ${request.method} ${request.path}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub || !payload.organizationId || !payload.role) {
      this.logger.warn(`JWT missing required claims: ${request.method} ${request.path}`);
      throw new UnauthorizedException('Invalid token claims');
    }

    const record = await this.authRepository.findByJti(payload.jti);
    if (record?.revokedAt) {
      this.logger.warn(`Revoked token used: jti=${payload.jti}`);
      throw new UnauthorizedException('Token has been revoked');
    }

    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
    };

    request.user = user;
    return true;
  }

  /**
   * Explicit transport policy:
   *   - Browser sessions  → cookie (key: "jwt")
   *   - API/machine auth  → Authorization: Bearer <token>
   *
   * If both are present and carry different identities, the request is
   * rejected. Silently choosing one would allow credential confusion attacks.
   */
  private extractToken(request: Request): string | undefined {
    const cookieToken = request.cookies?.jwt as string | undefined;
    const headerToken = this.extractBearer(request.headers.authorization);

    if (cookieToken && headerToken) {
      // Reject ambiguous requests — do not silently pick one.
      throw new UnauthorizedException(
        'Provide either a session cookie or an Authorization header, not both',
      );
    }

    return cookieToken ?? headerToken;
  }

  private extractBearer(authHeader: string | undefined): string | undefined {
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : undefined;
  }
}
