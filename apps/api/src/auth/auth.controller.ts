import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '@verifit/auth';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { Public } from './decorators/index.js';
import { AppConfigService } from '../config/app-config.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User created.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email/password and receive a JWT' })
  @ApiResponse({ status: 200, description: 'Returns access token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('google/login')
  @Public()
  @ApiOperation({ summary: 'Initiate Google OAuth login — redirects to Google' })
  @ApiResponse({ status: 302, description: 'Redirect to Google authorization.' })
  googleLogin(@Res() res: Response) {
    const { authorizationUrl } = this.authService.initiateLogin();
    res.redirect(authorizationUrl);
  }

  @Get('google/callback')
  @Public()
  @ApiOperation({ summary: 'Google OAuth callback — issues HTTP-only JWT cookie' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend after login.' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.handleOAuthCallback(code, state, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const maxAge = result.expiresAt.getTime() - Date.now();

    res.cookie('jwt', result.accessToken, {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    const frontendUrl = this.config.frontendUrl;
    res.redirect(`${frontendUrl}/dashboard`);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Authenticated user.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  getMe(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authService.getMe(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session token and clear the cookie' })
  @ApiResponse({ status: 204, description: 'Logged out.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as AuthenticatedUser;
    const token =
      (req.cookies as Record<string, string> | undefined)?.jwt ??
      req.headers.authorization?.slice(7);

    if (token) {
      const jti = this.authService.decodeJti(token);
      if (jti) {
        await this.authService.logout(jti, user.id, {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
    }

    res.clearCookie('jwt', { path: '/' });
  }
}
