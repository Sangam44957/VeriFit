import { Injectable } from '@nestjs/common';

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3001');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value ?? '<undefined>'}`);
  }

  return port;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid boolean value: ${value}`);
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
  readonly databaseUrl: string | undefined;
  readonly nodeEnv: string;

  constructor() {
    this.port = parsePort(process.env.PORT);
    this.corsOrigins = parseOrigins(process.env.CORS_ORIGINS);
    this.apiDocsEnabled = parseBoolean(process.env.API_DOCS_ENABLED, false);
    this.databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
    this.nodeEnv = process.env.NODE_ENV ?? 'development';
  }
}
