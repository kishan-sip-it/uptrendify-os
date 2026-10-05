export default function Loading() {
  return (
    <main className="main" aria-busy="true" aria-live="polite">
      <div className="grid" style={{ gap: 16 }}>
        <div className="card skeleton" style={{ height: 88 }} aria-hidden="true" />
        <div className="grid grid-3" style={{ gap: 16 }}>
          <div className="card skeleton" style={{ height: 160 }} aria-hidden="true" />
          <div className="card skeleton" style={{ height: 160 }} aria-hidden="true" />
          <div className="card skeleton" style={{ height: 160 }} aria-hidden="true" />
        </div>
        <p className="activity-meta">Loading the workspace…</p>
      </div>
    </main>
  );
}
