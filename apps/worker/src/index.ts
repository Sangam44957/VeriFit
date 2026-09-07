import { Redis } from 'ioredis';
import { loadRedisConfig, getRedisConnectionUrlRedacted } from './config/redis.js';
import { WorkerManager } from './worker/worker-manager.js';
import { HealthService } from './health/health-service.js';
import { buildApp } from './health/health-router.js';
import { logger } from './lib/logger.js';

async function main() {
  logger.info('VeriFit Worker starting...');

  const redisConfig = loadRedisConfig();
  const redis = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.database,
    maxRetriesPerRequest: null,
    enableReadyCheck: redisConfig.enableReadyCheck,
    enableOfflineQueue: redisConfig.enableOfflineQueue,
  });

  redis.on('connect', () => {
    logger.info(`Redis connected: ${getRedisConnectionUrlRedacted(redisConfig)}`);
  });

  redis.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  const workerManager = new WorkerManager();
  const healthService = new HealthService(redis);

  const rawPort = process.env.WORKER_PORT ?? process.env.PORT ?? '3002';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid worker port: "${rawPort}". Must be an integer between 1 and 65535.`);
  }

  const app = buildApp(healthService, workerManager);
  const server = app.listen(port, () => {
    logger.info(`Worker health server listening on port ${port}`);
  });

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received');

    // Hard deadline: force exit after 10 s regardless of what hangs
    const deadline = setTimeout(() => {
      logger.error('Shutdown deadline exceeded — forcing exit');
      process.exit(1);
    }, 10_000);
    deadline.unref();

    try {
      await new Promise<void>((resolve) =>
        server.close((err) => {
          if (err) logger.error('Error closing HTTP server:', err);
          resolve();
        }),
      );
      await workerManager.shutdown();
      await redis.quit();
      logger.info('Worker shutdown complete');
    } finally {
      clearTimeout(deadline);
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.info('VeriFit Worker ready');
}

main().catch((error) => {
  logger.error('Worker startup failed:', error);
  process.exit(1);
});
