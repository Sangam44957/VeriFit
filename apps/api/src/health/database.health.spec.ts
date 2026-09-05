import { describe, expect, it, vi } from 'vitest';

import { DatabaseHealthIndicator } from './database.health.js';

describe('DatabaseHealthIndicator', () => {
  it('reports database as up when the database check succeeds', async () => {
    const indicator = {
      check: vi.fn().mockReturnValue({
        up: vi.fn().mockReturnValue({
          database: {
            status: 'up',
          },
        }),
        down: vi.fn(),
      }),
    };

    const healthIndicatorService = indicator as never;

    const databaseHealth = {
      check: vi.fn().mockResolvedValue(undefined),
    };

    const service = new DatabaseHealthIndicator(healthIndicatorService, databaseHealth);

    const result = await service.check();

    expect(result).toEqual({
      database: {
        status: 'up',
      },
    });

    expect(databaseHealth.check).toHaveBeenCalledOnce();
  });

  it('reports database as down when the database check fails', async () => {
    const indicator = {
      check: vi.fn().mockReturnValue({
        up: vi.fn(),
        down: vi.fn().mockReturnValue({
          database: {
            status: 'down',
          },
        }),
      }),
    };

    const healthIndicatorService = indicator as never;

    const databaseHealth = {
      check: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    };

    const service = new DatabaseHealthIndicator(healthIndicatorService, databaseHealth);

    const result = await service.check();

    expect(result).toEqual({
      database: {
        status: 'down',
      },
    });
  });
});
