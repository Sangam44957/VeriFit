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
  return `redis://${config.password ? '***@' : ''}${config.host}:${config.port}/${config.database}`;
}
