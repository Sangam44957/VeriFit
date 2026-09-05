import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('checks liveness without requiring database access', async () => {
    const health = {
      check: vi.fn().mockResolvedValue({
        status: 'ok',
      }),
    };

    const database = {
      check: vi.fn(),
    };

    const controller = new HealthController(health as never, database as never);

    const result = await controller.live();

    expect(result).toEqual({
      status: 'ok',
    });

    expect(health.check).toHaveBeenCalledOnce();
    expect(database.check).not.toHaveBeenCalled();
  });

  it('checks dependencies for readiness', async () => {
    const health = {
      check: vi.fn().mockResolvedValue({
        status: 'ok',
      }),
    };

    const database = {
      check: vi.fn().mockResolvedValue({
        database: {
          status: 'up',
        },
      }),
    };

    const controller = new HealthController(health as never, database as never);

    await controller.ready();

    expect(health.check).toHaveBeenCalledOnce();
  });
});
