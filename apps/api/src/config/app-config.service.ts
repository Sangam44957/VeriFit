import { Injectable } from '@nestjs/common';

function parsePort(value: string | undefined, defaultPort: number): number {
  const port = Number(value ?? String(defaultPort));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port value: ${value ?? '<undefined>'}`);
  }

  return port;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function requireString(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseOrigins(value: string | undefined): string[] {
  const origins = (value ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  return origins;
}

@Injectable()
export class AppConfigService {
  readonly port: number;
  readonly corsOrigins: string[];
  readonly apiDocsEnabled: boolean;
  readonly nodeEnv: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly googleRedirectUri: string | undefined;

  constructor() {
    this.port = parsePort(process.env.API_PORT, 3001);
    this.corsOrigins = parseOrigins(process.env.CORS_ORIGINS);
    this.apiDocsEnabled = parseBoolean(process.env.API_DOCS_ENABLED, false);
    this.nodeEnv = process.env.NODE_ENV ?? 'development';
    this.jwtSecret = requireString(process.env.JWT_SECRET, 'JWT_SECRET');
    this.jwtExpiresIn = process.env.JWT_EXPIRATION ?? '15m';
    this.jwtIssuer = requireString(process.env.JWT_ISSUER, 'JWT_ISSUER');
    this.jwtAudience = requireString(process.env.JWT_AUDIENCE, 'JWT_AUDIENCE');
    this.googleClientId = process.env.GOOGLE_CLIENT_ID;
    this.googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
  }
}
