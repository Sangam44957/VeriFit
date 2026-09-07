import type { Redis } from 'ioredis';
import { logger } from '../lib/logger.js';

export interface WorkerHealth {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  redis: {
    status: 'connected' | 'disconnected';
    latency?: number;
  };
  workers: {
    registered: string[];
  };
}

export class HealthService {
  private startTime = Date.now();

  constructor(private redis: Redis) {}

  async getHealth(registeredWorkers: string[]): Promise<WorkerHealth> {
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';
    let redisLatency: number | undefined;

    try {
      const TIMEOUT_MS = 2000;
      const start = Date.now();
      await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), TIMEOUT_MS),
        ),
      ]);
      redisLatency = Date.now() - start;
      redisStatus = 'connected';
    } catch (error) {
      logger.warn('Redis connection check failed:', error);
    }

    return {
      status: redisStatus === 'connected' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      redis: { status: redisStatus, latency: redisLatency },
      workers: { registered: registeredWorkers },
    };
  }
}
