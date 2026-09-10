import { Module } from '@nestjs/common';
import { DatabaseModule } from '@verifit/database';
import { JwtService } from '@verifit/auth';
import { AppConfigService } from '../config/app-config.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/index.js';
import { RoleGuard } from './guards/index.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
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
    AuthGuard,
    RoleGuard,
  ],
  exports: [JwtService, AuthGuard, RoleGuard],
})
export class AuthModule {}
