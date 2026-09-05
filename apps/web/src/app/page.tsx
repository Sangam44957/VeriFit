export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-5xl font-bold text-slate-900">VeriFit</h1>
        <p className="mb-8 text-xl text-slate-600">
          Candidate Evidence Intelligence &amp; Company-Specific Placement Ranking
        </p>
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <p className="mb-6 text-slate-700">
            Welcome to VeriFit. This platform collects legitimate technical evidence, reconciles
            candidate claims with evidence, and produces explainable company-specific rankings.
          </p>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold">Status:</span> Foundation Phase
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">Next:</span> Authentication &amp; Multi-Tenancy
            </p>
          </div>
        </div>
        <div className="mt-8">
          <a
            href="/health"
            className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-white transition hover:bg-slate-800"
          >
            Health Check
          </a>
        </div>
      </div>
    </main>
  );
}
