import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword, JwtService, type UserRole } from '@verifit/auth';
import { PrismaService, AuthRepository, Role } from '@verifit/database';
import { LoginDto, RegisterDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authRepository: AuthRepository,
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

  resolveOAuthUser(
    provider: string,
    organizationId?: string,
  ): (
    googleSub: string,
    email: string,
    orgId?: string,
  ) => Promise<{ id: string; email: string; organizationId: string; role: UserRole }> {
    return (googleSub: string, email: string, orgId?: string) =>
      this.authRepository.resolveOAuthUser({
        provider,
        providerUserId: googleSub,
        providerEmail: email,
        organizationId: orgId ?? organizationId,
      }) as Promise<{ id: string; email: string; organizationId: string; role: UserRole }>;
  }
}
