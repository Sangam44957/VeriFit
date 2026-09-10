import { DynamicModule, Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, type JwtConfig } from './services/jwt.service.js';
import { OAuthService, type GoogleOAuthConfig } from './services/oauth.service.js';
import { AuthorizationService } from './services/authorization.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { RoleGuard } from './guards/role.guard.js';

export interface AuthModuleConfig {
  jwt: JwtConfig;
  oauth: GoogleOAuthConfig;
}

const SHARED_PROVIDERS = [AuthorizationService, AuthGuard, RoleGuard, Reflector];
const EXPORTS = [JwtService, OAuthService, AuthorizationService, AuthGuard, RoleGuard];

@Global()
@Module({})
export class AuthModule {
  static register(config: AuthModuleConfig): DynamicModule {
    const jwtService = new JwtService(config.jwt);
    const oauthService = new OAuthService(jwtService, config.oauth);

    return {
      module: AuthModule,
      providers: [
        { provide: JwtService, useValue: jwtService },
        { provide: OAuthService, useValue: oauthService },
        ...SHARED_PROVIDERS,
      ],
      exports: EXPORTS,
    };
  }

  static registerAsync(options: {
    useFactory: (...args: unknown[]) => Promise<AuthModuleConfig> | AuthModuleConfig;
    inject?: unknown[];
  }): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        {
          provide: 'AUTH_MODULE_CONFIG',
          useFactory: options.useFactory,
          inject: (options.inject ?? []) as never[],
        },
        {
          provide: JwtService,
          useFactory: (config: AuthModuleConfig) => new JwtService(config.jwt),
          inject: ['AUTH_MODULE_CONFIG'],
        },
        {
          provide: OAuthService,
          useFactory: (config: AuthModuleConfig, jwt: JwtService) =>
            new OAuthService(jwt, config.oauth),
          inject: ['AUTH_MODULE_CONFIG', JwtService],
        },
        ...SHARED_PROVIDERS,
      ],
      exports: EXPORTS,
    };
  }
}
