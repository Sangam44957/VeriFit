import { z } from 'zod';

export const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().default(6379),
  password: z.string().optional(),
  database: z.coerce.number().int().default(0),
  enableReadyCheck: z.coerce.boolean().default(true),
  enableOfflineQueue: z.coerce.boolean().default(true),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;

export function loadRedisConfig(): RedisConfig {
  return RedisConfigSchema.parse({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    database: process.env.REDIS_DB,
  });
}

export function getRedisConnectionUrl(config: RedisConfig): string {
  const url = new URL(`redis://${config.host}`);
  url.port = String(config.port);
  url.pathname = `/${config.database}`;
  if (config.password) url.password = config.password;
  return url.toString();
}

/** Redacted URL safe for logging — password replaced with *** */
export function getRedisConnectionUrlRedacted(config: RedisConfig): string {
  const url = new URL(getRedisConnectionUrl(config));
  if (url.password) url.password = '***';
  return url.toString();
}
