export default function HealthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="rounded-lg bg-white p-8 shadow-xl">
        <h1 className="mb-4 text-3xl font-bold text-slate-900">VeriFit Health</h1>
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Status:</span>{' '}
            <span className="text-green-600">✓ Operational</span>
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Service:</span> Next.js Web
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Timestamp:</span> {new Date().toISOString()}
          </p>
        </div>
      </div>
    </div>
  );
}
