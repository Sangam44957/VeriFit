import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword, JwtService } from '@verifit/auth';
import { PrismaService, Role } from '@verifit/database';
import { LoginDto, RegisterDto } from './auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  async login(dto: LoginDto) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(dto.password, user?.passwordHash ?? this.dummyHash);

    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    return { accessToken };
  }
}
