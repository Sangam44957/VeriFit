import { describe, expect, it } from 'vitest';

import { HealthModule } from './health.module.js';

describe('HealthModule', () => {
  it('is a class', () => {
    expect(typeof HealthModule).toBe('function');
  });
});
