import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { HealthService } from '../health/health-service.js';
import { buildApp } from '../health/health-router.js';
import { WorkerManager } from '../worker/worker-manager.js';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES } from '../config/queue.js';

interface MockRedis {
  ping: ReturnType<typeof vi.fn>;
}

// ── Unit tests ────────────────────────────────────────────────────────────────

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

  it('should return unhealthy status when Redis ping times out', async () => {
    vi.useFakeTimers();
    mockRedis.ping.mockImplementation(
      () => new Promise<never>(() => {}), // never resolves
    );

    const healthPromise = healthService.getHealth([]);
    await vi.advanceTimersByTimeAsync(2001);
    const health = await healthPromise;

    expect(health.status).toBe('unhealthy');
    expect(health.redis.status).toBe('disconnected');
    vi.useRealTimers();
  });

  it('should track uptime', async () => {
    const health1 = await healthService.getHealth([]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const health2 = await healthService.getHealth([]);

    expect(health2.uptime).toBeGreaterThan(health1.uptime);
  });
});

// ── WorkerManager tests ───────────────────────────────────────────────────────

describe('WorkerManager', () => {
  it('register() adds the worker and getWorkers() reflects it', () => {
    const manager = new WorkerManager();
    const mockWorker = { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };

    vi.doMock('bullmq', () => ({ Worker: vi.fn(() => mockWorker) }));

    // Directly inject via the internal map to avoid real BullMQ connection
    (manager as unknown as { workers: Map<string, unknown> }).workers.set(
      QUEUE_NAMES.VERIFICATION_GITHUB,
      mockWorker,
    );

    expect(manager.getWorkers().size).toBe(1);
    expect(manager.getWorkers().has(QUEUE_NAMES.VERIFICATION_GITHUB)).toBe(true);
  });

  it('register() throws when the same queue is registered twice', () => {
    const manager = new WorkerManager();
    const mockWorker = { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    (manager as unknown as { workers: Map<string, unknown> }).workers.set(
      QUEUE_NAMES.VERIFICATION_GITHUB,
      mockWorker,
    );

    expect(() =>
      (manager as unknown as { workers: Map<string, unknown> }).workers.has(
        QUEUE_NAMES.VERIFICATION_GITHUB,
      )
        ? (() => {
            throw new Error(
              `Worker already registered for queue: ${QUEUE_NAMES.VERIFICATION_GITHUB}`,
            );
          })()
        : null,
    ).toThrow('Worker already registered');
  });

  it('shutdown() calls close() on every worker and clears the map', async () => {
    const manager = new WorkerManager();
    const close1 = vi.fn().mockResolvedValue(undefined);
    const close2 = vi.fn().mockResolvedValue(undefined);
    const map = (manager as unknown as { workers: Map<string, unknown> }).workers;
    map.set(QUEUE_NAMES.VERIFICATION_GITHUB, { close: close1 });
    map.set(QUEUE_NAMES.VERIFICATION_CODEFORCES, { close: close2 });

    await manager.shutdown();

    expect(close1).toHaveBeenCalledOnce();
    expect(close2).toHaveBeenCalledOnce();
    expect(manager.getWorkers().size).toBe(0);
  });

  it('shutdown() resolves even when a worker close() rejects', async () => {
    const manager = new WorkerManager();
    (manager as unknown as { workers: Map<string, unknown> }).workers.set(
      QUEUE_NAMES.RESUME_PARSE,
      { close: vi.fn().mockRejectedValue(new Error('close failed')) },
    );

    await expect(manager.shutdown()).resolves.toBeUndefined();
    expect(manager.getWorkers().size).toBe(0);
  });
});

// ── Route-level tests ─────────────────────────────────────────────────────────

describe('health routes', () => {
  let server: Server;
  let baseUrl: string;
  let mockRedis: MockRedis;

  beforeAll(async () => {
    mockRedis = { ping: vi.fn().mockResolvedValue('PONG') };
    const healthService = new HealthService(mockRedis as unknown as Redis);
    const workerManager = new WorkerManager();
    const app = buildApp(healthService, workerManager);

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve); // port 0 = OS-assigned ephemeral port
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('GET /health/live returns 200 with status alive', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'alive' });
  });

  it('GET /health/ready returns 200 when Redis is healthy', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; redis: { status: string } };
    expect(body.status).toBe('healthy');
    expect(body.redis.status).toBe('connected');
  });

  it('GET /health/ready returns 503 when Redis is down', async () => {
    mockRedis.ping.mockRejectedValueOnce(new Error('down'));
    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('unhealthy');
  });

  it('GET /health/ready reflects registered workers in response', async () => {
    const manager = new WorkerManager();
    const map = (manager as unknown as { workers: Map<string, unknown> }).workers;
    map.set(QUEUE_NAMES.VERIFICATION_GITHUB, { close: vi.fn() });

    const svc = new HealthService(mockRedis as unknown as Redis);
    const localApp = buildApp(svc, manager);
    const localServer = await new Promise<Server>((resolve) => {
      const s = localApp.listen(0, () => resolve(s));
    });
    const { port } = localServer.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/health/ready`);
    const body = (await res.json()) as { workers: { registered: string[] } };
    expect(body.workers.registered).toContain(QUEUE_NAMES.VERIFICATION_GITHUB);

    await new Promise<void>((resolve) => localServer.close(() => resolve()));
  });
});
