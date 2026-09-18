import styles from './progress.module.css';
import { ArrowRight, CheckCircle2, CircleDashed, Gauge, Layers3, ShieldCheck } from 'lucide-react';
import { PROJECT_PHASES, progressStats } from '@/lib/progress/phases';

export const metadata = {
  title: 'Progress — UpTrendify OS',
  description: 'UpTrendify OS implementation-phase progress tracker.',
};

export default function ProgressPage() {
  const stats = progressStats();

  return (
    <main className={styles.progressShell}>
      <section className={styles.progressHero}>
        <div className={styles.progressEyebrow}><span className={styles.progressEyebrowDot} /> Implementation snapshot</div>
        <div className={styles.progressHeroGrid}>
          <div>
            <h1>UpTrendify OS <span>/ progress</span></h1>
            <p className={styles.progressLede}>A live view of what is implemented across the agency operating system — from foundation and research to intelligence, review and strategy.</p>
            <div className={styles.progressHeroChips}>
              <span className={styles.progressChip}><ShieldCheck size={14} /> 9 phases delivered</span>
              <span className={styles.progressChip}><Layers3 size={14} /> 13 total phases</span>
              <span className={styles.progressChip}><Gauge size={14} /> {stats.percent}% complete</span>
            </div>
          </div>

          <div className={styles.progressScoreCard}>
            <div className={styles.progressScoreTop}><span>Implementation</span><strong>{stats.percent}%</strong></div>
            <div className="progress-track progress-track-large" aria-label={stats.percent + '% complete'}><span style={{ width: stats.percent + '%' }} /></div>
            <div className={styles.progressScoreMeta}><span>{stats.completed} completed</span><span>{stats.pending} remaining</span></div>
          </div>
        </div>
      </section>

      <section className={styles.progressStats} aria-label="Progress summary">
        <div className={styles.progressStatCard}><span className="progress-stat-icon progress-good"><CheckCircle2 size={17} /></span><div><strong>{stats.completed}</strong><span>Completed</span></div></div>
        <div className={styles.progressStatCard}><span className="progress-stat-icon progress-neutral"><CircleDashed size={17} /></span><div><strong>{stats.inProgress}</strong><span>In progress</span></div></div>
        <div className={styles.progressStatCard}><span className="progress-stat-icon progress-muted"><Layers3 size={17} /></span><div><strong>{stats.pending}</strong><span>Pending</span></div></div>
      </section>

      <section className={styles.progressTimeline} aria-labelledby="progress-timeline-title">
        <div className={styles.progressSectionHead}><div><div className={styles.progressEyebrow}>Delivery timeline</div><h2 id="progress-timeline-title">Product phases</h2></div><span className={styles.progressNote}>Delivery status, not production readiness</span></div>
        <div className={styles.progressList}>
          {PROJECT_PHASES.map((phase, index) => {
            const done = phase.status === 'COMPLETED';
            const active = phase.status === 'IN_PROGRESS';
            return (
              <article key={phase.phase} className={styles.progressPhase + ' ' + (done ? 'is-done ' : '') + (active ? 'is-active' : '')} style={{ animationDelay: Math.min(index * 45, 500) + 'ms' }}>
                <div className={styles.progressPhaseRail}>
                  <div className={styles.progressPhaseNode}>{done ? <CheckCircle2 size={16} /> : active ? <ArrowRight size={16} /> : <span />}</div>
                  {index < PROJECT_PHASES.length - 1 ? <div className={styles.progressPhaseLine} /> : null}
                </div>
                <div className={styles.progressPhaseCard}>
                  <div className={styles.progressPhaseHead}>
                    <div><div className={styles.progressPhaseKicker}>Phase {String(phase.phase).padStart(2, '0')}</div><h3>{phase.title}</h3></div>
                    <span className={styles.progressStatus + ' ' + (done ? 'status-done' : active ? 'status-active' : 'status-pending')}>{done ? 'Completed' : active ? 'In progress' : 'Pending'}</span>
                  </div>
                  <p>{phase.description}</p>
                  {phase.evidence.length > 0 ? (
                    <div className={styles.progressEvidence}>
                      {phase.evidence.map((item) => <span key={item}><CheckCircle2 size={13} /> {item}</span>)}
                    </div>
                  ) : <div className={styles.progressFuture}>Next delivery layer</div>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}