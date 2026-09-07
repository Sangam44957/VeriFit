const API_HEALTH_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ApiHealth = {
  status: string;
  info?: Record<string, { status: string }>;
};

type PageStatus = 'healthy' | 'degraded' | 'unavailable';

async function fetchHealth(): Promise<{ status: PageStatus; detail: string }> {
  try {
    const res = await fetch(`${API_HEALTH_URL}/api/v1/health/ready`, {
      next: { revalidate: 0 },
    });
    const body: ApiHealth = await res.json();
    if (res.ok && body.status === 'ok') {
      return { status: 'healthy', detail: 'All systems operational' };
    }
    return { status: 'degraded', detail: `API reported: ${body.status}` };
  } catch {
    return { status: 'unavailable', detail: 'API is unreachable' };
  }
}

const statusStyles: Record<PageStatus, string> = {
  healthy: 'text-green-600',
  degraded: 'text-yellow-600',
  unavailable: 'text-red-600',
};

const statusLabel: Record<PageStatus, string> = {
  healthy: '✓ Healthy',
  degraded: '⚠ Degraded',
  unavailable: '✗ Unavailable',
};

export default async function HealthPage() {
  const { status, detail } = await fetchHealth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="rounded-lg bg-white p-8 shadow-xl">
        <h1 className="mb-4 text-3xl font-bold text-slate-900">VeriFit Health</h1>
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Status:</span>{' '}
            <span className={statusStyles[status]}>{statusLabel[status]}</span>
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Detail:</span> {detail}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Timestamp:</span> {new Date().toISOString()}
          </p>
        </div>
      </div>
    </div>
  );
}
