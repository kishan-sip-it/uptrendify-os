import { ArrowRight, CheckCircle2, CircleDashed, Gauge, Layers3, ShieldCheck } from 'lucide-react';
import { PROJECT_PHASES, progressStats } from '@/lib/progress/phases';

export const metadata = {
  title: 'Progress — UpTrendify OS',
  description: 'UpTrendify OS implementation-phase progress tracker.',
};

export default function ProgressPage() {
  const stats = progressStats();

  return (
    <main className="progress-shell">
      <section className="progress-hero">
        <div className="progress-eyebrow"><span className="progress-eyebrow-dot" /> Implementation snapshot</div>
        <div className="progress-hero-grid">
          <div>
            <h1>UpTrendify OS <span>/ progress</span></h1>
            <p className="progress-lede">A live view of what is implemented across the agency operating system — from foundation and research to intelligence, review and strategy.</p>
            <div className="progress-hero-chips">
              <span className="progress-chip"><ShieldCheck size={14} /> 9 phases delivered</span>
              <span className="progress-chip"><Layers3 size={14} /> 13 total phases</span>
              <span className="progress-chip"><Gauge size={14} /> {stats.percent}% complete</span>
            </div>
          </div>

          <div className="progress-score-card">
            <div className="progress-score-top"><span>Implementation</span><strong>{stats.percent}%</strong></div>
            <div className="progress-track progress-track-large" aria-label={stats.percent + '% complete'}><span style={{ width: stats.percent + '%' }} /></div>
            <div className="progress-score-meta"><span>{stats.completed} completed</span><span>{stats.pending} remaining</span></div>
          </div>
        </div>
      </section>

      <section className="progress-stats" aria-label="Progress summary">
        <div className="progress-stat-card"><span className="progress-stat-icon progress-good"><CheckCircle2 size={17} /></span><div><strong>{stats.completed}</strong><span>Completed</span></div></div>
        <div className="progress-stat-card"><span className="progress-stat-icon progress-neutral"><CircleDashed size={17} /></span><div><strong>{stats.inProgress}</strong><span>In progress</span></div></div>
        <div className="progress-stat-card"><span className="progress-stat-icon progress-muted"><Layers3 size={17} /></span><div><strong>{stats.pending}</strong><span>Pending</span></div></div>
      </section>

      <section className="progress-timeline" aria-labelledby="progress-timeline-title">
        <div className="progress-section-head"><div><div className="progress-eyebrow">Delivery timeline</div><h2 id="progress-timeline-title">Product phases</h2></div><span className="progress-note">Delivery status, not production readiness</span></div>
        <div className="progress-list">
          {PROJECT_PHASES.map((phase, index) => {
            const done = phase.status === 'COMPLETED';
            const active = phase.status === 'IN_PROGRESS';
            return (
              <article key={phase.phase} className={'progress-phase ' + (done ? 'is-done ' : '') + (active ? 'is-active' : '')} style={{ animationDelay: Math.min(index * 45, 500) + 'ms' }}>
                <div className="progress-phase-rail">
                  <div className="progress-phase-node">{done ? <CheckCircle2 size={16} /> : active ? <ArrowRight size={16} /> : <span />}</div>
                  {index < PROJECT_PHASES.length - 1 ? <div className="progress-phase-line" /> : null}
                </div>
                <div className="progress-phase-card">
                  <div className="progress-phase-head">
                    <div><div className="progress-phase-kicker">Phase {String(phase.phase).padStart(2, '0')}</div><h3>{phase.title}</h3></div>
                    <span className={'progress-status ' + (done ? 'status-done' : active ? 'status-active' : 'status-pending')}>{done ? 'Completed' : active ? 'In progress' : 'Pending'}</span>
                  </div>
                  <p>{phase.description}</p>
                  {phase.evidence.length > 0 ? (
                    <div className="progress-evidence">
                      {phase.evidence.map((item) => <span key={item}><CheckCircle2 size={13} /> {item}</span>)}
                    </div>
                  ) : <div className="progress-future">Next delivery layer</div>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}