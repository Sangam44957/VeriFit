import { Redis } from 'ioredis';
import express from 'express';
import { loadRedisConfig, getRedisConnectionUrl } from './config/redis.js';
import { WorkerManager } from './worker/worker-manager.js';
import { HealthService } from './health/health-service.js';
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
    logger.info(`Redis connected: ${getRedisConnectionUrl(redisConfig)}`);
  });

  redis.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  const workerManager = new WorkerManager(redis);
  const healthService = new HealthService(redis);

  const app = express();
  const port = process.env.PORT ?? 3002;

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  app.get('/health/ready', async (_req, res) => {
    const health = await healthService.getHealth(
      Array.from(workerManager.getWorkers().keys()),
    );
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  const server = app.listen(port, () => {
    logger.info(`Worker health server listening on port ${port}`);
  });

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutdown signal received');

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    await workerManager.shutdown();
    await redis.quit();
    logger.info('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  logger.info('VeriFit Worker ready');
}

main().catch((error) => {
  logger.error('Worker startup failed:', error);
  process.exit(1);
});
