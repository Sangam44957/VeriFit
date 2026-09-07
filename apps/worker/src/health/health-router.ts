import express, { type Express } from 'express';
import type { HealthService } from './health-service.js';
import type { WorkerManager } from '../worker/worker-manager.js';

export function buildApp(healthService: HealthService, workerManager: WorkerManager): Express {
  const app = express();

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  app.get('/health/ready', async (_req, res) => {
    const health = await healthService.getHealth(Array.from(workerManager.getWorkers().keys()));
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  return app;
}
