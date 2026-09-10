import { Module } from '@nestjs/common';
import { DatabaseModule, AuthRepository, DbOAuthStateStore, PrismaService } from '@verifit/database';
import { JwtService, OAuthService } from '@verifit/auth';
import { AppConfigService } from '../config/app-config.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/index.js';
import { RoleGuard } from './guards/index.js';
import { AuditService } from '../audit/audit.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    {
      provide: JwtService,
      useFactory: (config: AppConfigService) =>
        new JwtService({
          secret: config.jwtSecret,
          expiresIn: config.jwtExpiresIn,
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        }),
      inject: [AppConfigService],
    },
    {
      provide: OAuthService,
      useFactory: (
        jwtService: JwtService,
        config: AppConfigService,
        stateStore: DbOAuthStateStore,
      ) => {
        if (!config.googleClientId || !config.googleClientSecret || !config.googleRedirectUri) {
          return null;
        }
        return new OAuthService(
          jwtService,
          {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            redirectUri: config.googleRedirectUri,
          },
          stateStore,
        );
      },
      inject: [JwtService, AppConfigService, DbOAuthStateStore],
    },
    {
      provide: AuthService,
      useFactory: (
        prisma: PrismaService,
        jwtService: JwtService,
        authRepository: AuthRepository,
        oauthService: OAuthService | null,
        auditService: AuditService,
      ) => new AuthService(prisma, jwtService, authRepository, oauthService, auditService),
      inject: [PrismaService, JwtService, AuthRepository, OAuthService, AuditService],
    },
    AuthGuard,
    RoleGuard,
    AuditService,
  ],
  exports: [JwtService, OAuthService, AuthGuard, RoleGuard],
})
export class AuthModule {}
