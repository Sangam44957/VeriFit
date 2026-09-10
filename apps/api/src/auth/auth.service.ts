import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword, JwtService, OAuthService, type UserRole } from '@verifit/auth';
import { PrismaService, AuthRepository, Role } from '@verifit/database';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { AuditService } from '../audit/audit.service.js';

export interface OAuthCallbackResult {
  accessToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: UserRole;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
    private readonly oauthService: OAuthService | null,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const org = await this.prisma.client.organization.findUnique({
      where: { id: dto.organizationId },
      select: { id: true },
    });
    if (!org) throw new BadRequestException('Invalid organizationId');

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: Role.STUDENT,
        organizationId: dto.organizationId,
      },
      select: { id: true, email: true, role: true },
    });

    return user;
  }

  private readonly dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RUlORVhJU1RTREFUQQ';

  async login(dto: LoginDto, opts?: { ipAddress?: string; userAgent?: string }) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(dto.password, user?.passwordHash ?? this.dummyHash);

    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    const meta = this.jwtService.createTokenRecordMetadata(accessToken, opts);
    await this.authRepository.createToken({
      userId: user.id,
      jti: meta.jti,
      expiresAt: meta.expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { accessToken };
  }

  initiateLogin(): { authorizationUrl: string } {
    if (!this.oauthService) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }
    const { authorizationUrl } = this.oauthService.generateAuthorizationUrl();
    return { authorizationUrl };
  }

  async handleOAuthCallback(
    code: string,
    state: string,
    opts?: { ipAddress?: string; userAgent?: string },
  ): Promise<OAuthCallbackResult> {
    if (!this.oauthService) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    const result = await this.oauthService.handleCallback(
      code,
      state,
      async (googleSub, _email) => {
        const resolved = await this.authRepository.resolveOAuthUser({
          provider: 'google',
          providerUserId: googleSub,
          providerEmail: _email,
        });

        if (resolved.accountStatus !== 'ACTIVE') {
          throw new ForbiddenException(`Account is ${resolved.accountStatus.toLowerCase()}`);
        }

        return {
          id: resolved.id,
          email: resolved.email,
          organizationId: resolved.organizationId,
          role: resolved.role as UserRole,
        };
      },
    );

    const meta = this.jwtService.createTokenRecordMetadata(result.accessToken, opts);

    await this.prisma.client.$transaction([
      this.prisma.client.authToken.create({
        data: {
          userId: result.user.id,
          jti: meta.jti,
          expiresAt: meta.expiresAt,
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
      }),
      this.prisma.client.user.update({
        where: { id: result.user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIpAddress: opts?.ipAddress ?? null,
        },
      }),
    ]);

    this.auditService.log({
      action: 'oauth_login',
      userId: result.user.id,
      ipAddress: opts?.ipAddress,
      userAgent: opts?.userAgent,
    });

    return {
      accessToken: result.accessToken,
      expiresAt: meta.expiresAt,
      user: result.user,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, organizationId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async logout(jti: string, userId?: string, opts?: { ipAddress?: string; userAgent?: string }): Promise<void> {
    await this.authRepository.revoke(jti);
    this.auditService.log({
      action: 'logout',
      userId: userId ?? 'unknown',
      ipAddress: opts?.ipAddress,
      userAgent: opts?.userAgent,
    });
  }

  decodeJti(token: string): string | undefined {
    return this.jwtService.decodeUnverifiedClaims(token)?.jti;
  }
}
