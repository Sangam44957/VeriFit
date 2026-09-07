import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

function makeHealth(result: unknown) {
  return { check: vi.fn().mockResolvedValue(result) };
}

function makeDb(resolves: boolean) {
  return {
    check: resolves
      ? vi.fn().mockResolvedValue({ database: { status: 'up' } })
      : vi.fn().mockRejectedValue(new Error('db down')),
  };
}

describe('HealthController', () => {
  it('live() calls health.check with no indicators', async () => {
    const health = makeHealth({ status: 'ok' });
    const controller = new HealthController(health as never, makeDb(true) as never);
    await controller.live();
    expect(health.check).toHaveBeenCalledWith([]);
  });

  it('live() does not call DatabaseHealthIndicator', async () => {
    const db = makeDb(true);
    const controller = new HealthController(makeHealth({ status: 'ok' }) as never, db as never);
    await controller.live();
    expect(db.check).not.toHaveBeenCalled();
  });

  it('ready() calls health.check with a database indicator', async () => {
    const health = makeHealth({ status: 'ok', info: { database: { status: 'up' } } });
    const db = makeDb(true);
    const controller = new HealthController(health as never, db as never);
    const result = await controller.ready();
    expect(health.check).toHaveBeenCalledWith([expect.any(Function)]);
    expect(result).toMatchObject({ status: 'ok' });
  });

  it('ready() propagates database failure', async () => {
    const health = { check: vi.fn().mockRejectedValue(new Error('db down')) };
    const controller = new HealthController(health as never, makeDb(false) as never);
    await expect(controller.ready()).rejects.toThrow('db down');
  });
});
