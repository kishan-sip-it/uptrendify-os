import { PageSkeleton } from '@/components/ui/skeleton';

export default function WorkspaceLoading() {
  return (
    <main className="main ui-route-loading" aria-busy="true">
      <div className="app-route-pending" role="status" aria-live="polite">
        <span className="app-route-pending-track" aria-hidden="true">
          <span />
        </span>
        <span>Opening workspace…</span>
      </div>
      <PageSkeleton />
      <style>{`
        .app-route-pending {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 14px;
          color: var(--text-muted, var(--muted));
          font-size: 12px;
        }
        .app-route-pending-track {
          position: relative;
          display: block;
          overflow: hidden;
          width: 96px;
          height: 3px;
          border-radius: 999px;
          background: var(--surface-progress, var(--line));
        }
        .app-route-pending-track span {
          position: absolute;
          inset: 0 auto 0 0;
          width: 38%;
          border-radius: inherit;
          background: linear-gradient(90deg, #4f8bff, #7c9cff, #4f8bff);
          animation: app-route-pending-sweep 1.15s ease-in-out infinite;
        }
        @keyframes app-route-pending-sweep {
          from { transform: translateX(-110%); }
          to { transform: translateX(270%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .app-route-pending-track span { animation-duration: 2.4s; }
        }
      `}</style>
    </main>
  );
}
