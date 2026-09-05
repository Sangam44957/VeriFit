import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthService } from '../health/health-service.js';
import type { Redis } from 'ioredis';

interface MockRedis {
  ping: ReturnType<typeof vi.fn>;
}

describe('HealthService', () => {
  let healthService: HealthService;
  let mockRedis: MockRedis;

  beforeEach(() => {
    mockRedis = { ping: vi.fn().mockResolvedValue('PONG') };
    healthService = new HealthService(mockRedis as unknown as Redis);
  });

  it('should return healthy status when Redis is connected', async () => {
    const health = await healthService.getHealth(['verification:github']);

    expect(health.status).toBe('healthy');
    expect(health.redis.status).toBe('connected');
    expect(health.redis.latency).toBeGreaterThanOrEqual(0);
    expect(health.workers.registered).toHaveLength(1);
  });

  it('should return unhealthy status when Redis fails', async () => {
    mockRedis.ping.mockRejectedValueOnce(new Error('Connection failed'));

    const health = await healthService.getHealth(['verification:github']);

    expect(health.status).toBe('unhealthy');
    expect(health.redis.status).toBe('disconnected');
  });

  it('should track uptime', async () => {
    const health1 = await healthService.getHealth([]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const health2 = await healthService.getHealth([]);

    expect(health2.uptime).toBeGreaterThan(health1.uptime);
  });
});
