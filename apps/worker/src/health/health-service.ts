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
      const start = Date.now();
      await this.redis.ping();
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
