import { PROJECT_PHASES } from '@/lib/progress/phases';

export const metadata = {
  title: 'Progress — UpTrendify OS',
  description: 'UpTrendify OS implementation-phase progress tracker.',
};

export default function ProgressPage() {
  const total = PROJECT_PHASES.length;
  const completed = PROJECT_PHASES.filter((p) => p.status === 'COMPLETED').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">UpTrendify OS — /progress</h1>
      <p className="mt-1 text-sm text-muted-foreground">Implementation progress by phase. This page measures delivery of the product, not production readiness.</p>

      <div className="mt-4 flex items-center gap-3 rounded-xl border p-4">
        <div className="text-3xl font-bold">{percent}%</div>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {completed} of {total} phases completed
          </p>
        </div>
      </div>

      <ol className="mt-6 space-y-3">
        {PROJECT_PHASES.map((phase) => {
          const done = phase.status === 'COMPLETED';
          return (
            <li key={phase.phase} className="flex gap-3 rounded-xl border p-4">
              <span className="mt-0.5 text-lg" aria-hidden>{done ? '✅' : '⬜'}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Phase {phase.phase} — {phase.title}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {phase.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{phase.description}</p>
                {phase.evidence.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {phase.evidence.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
