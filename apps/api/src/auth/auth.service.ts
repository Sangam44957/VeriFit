import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashPassword, verifyPassword, signJwt } from '@verifit/auth';
import { PrismaService } from '@verifit/database';
import { AppConfigService } from '../config/app-config.service.js';
import { LoginDto, RegisterDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        organizationId: dto.organizationId,
      },
      select: { id: true, email: true, role: true },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const accessToken = signJwt(
      { sub: user.id, email: user.email, role: user.role },
      this.config.jwtSecret,
      '1h',
    );

    return { accessToken };
  }
}
