import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HealthPage from '@/app/health/page';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('HealthPage', () => {
  it('shows healthy when API returns ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      }),
    );
    render(await HealthPage());
    expect(screen.getByText(/✓ Healthy/)).toBeInTheDocument();
    expect(screen.getByText(/All systems operational/)).toBeInTheDocument();
  });

  it('shows degraded when API returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ status: 'error' }),
      }),
    );
    render(await HealthPage());
    expect(screen.getByText(/⚠ Degraded/)).toBeInTheDocument();
    expect(screen.getByText(/API reported: error/)).toBeInTheDocument();
  });

  it('shows unavailable when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(await HealthPage());
    expect(screen.getByText(/✗ Unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/API is unreachable/)).toBeInTheDocument();
  });
});
