import styles from './progress.module.css';
import { ArrowRight, BarChart3, CheckCircle2, CircleDashed, FileCheck2, Gauge, Layers3, Search, ShieldCheck, Target } from 'lucide-react';
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
              <span className={styles.progressChip}><ShieldCheck size={14} /> {stats.completed} phases delivered</span>
              <span className={styles.progressChip}><Layers3 size={14} /> 13 total phases</span>
              <span className={styles.progressChip}><Gauge size={14} /> {stats.percent}% complete</span>
            </div>
          </div>

          <div className={styles.progressScoreCard}>
            <div className={styles.progressScoreTop}><span>Implementation</span><strong>{stats.percent}%</strong></div>
            <div className={styles.progressTrack + " " + styles.progressTrackLarge} aria-label={stats.percent + '% complete'}><span style={{ width: stats.percent + '%' }} /></div>
            <div className={styles.progressScoreMeta}><span>{stats.completed} completed</span><span>{stats.pending} remaining</span></div>
          </div>
        </div>
      </section>

      <section className={styles.progressStats} aria-label="Progress summary">
        <div className={styles.progressStatCard}><span className={styles.progressStatIcon + " " + styles.progressGood}><CheckCircle2 size={17} /></span><div><strong>{stats.completed}</strong><span>Completed</span></div></div>
        <div className={styles.progressStatCard}><span className={styles.progressStatIcon + " " + styles.progressNeutral}><CircleDashed size={17} /></span><div><strong>{stats.inProgress}</strong><span>In progress</span></div></div>
        <div className={styles.progressStatCard}><span className={styles.progressStatIcon + " " + styles.progressMuted}><Layers3 size={17} /></span><div><strong>{stats.pending}</strong><span>Pending</span></div></div>
      </section>

      <section className={styles.progressFlow} aria-labelledby="progress-flow-title">
        <div className={styles.progressSectionHead}>
          <div>
            <div className={styles.progressEyebrow}>How to use the product</div>
            <h2 id="progress-flow-title">Actual UpTrendify workflow</h2>
          </div>
          <span className={styles.progressNote}>Follow the flow in order</span>
        </div>

        <div className={styles.progressFlowGrid}>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>01</span><Search size={16} /></div>
            <h3>Choose a client brand</h3>
            <p>Start inside the agency workspace, select a client and open the brand you want to work on.</p>
          </article>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>02</span><Search size={16} /></div>
            <h3>Research the website</h3>
            <p>Run website research to collect public-page evidence and source-backed brand information.</p>
          </article>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>03</span><FileCheck2 size={16} /></div>
            <h3>Review the Brand Brain</h3>
            <p>Approve, edit, reject or regenerate suggestions. Only approved truth unlocks the next stage.</p>
          </article>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>04</span><Target size={16} /></div>
            <h3>Generate strategy</h3>
            <p>Generate a versioned strategy from the approved brand intelligence for that specific client brand.</p>
          </article>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>05</span><Layers3 size={16} /></div>
            <h3>Next: Content & campaigns</h3>
            <p>These delivery layers are still pending in the current implementation roadmap.</p>
          </article>
          <article className={styles.progressFlowCard}>
            <div className={styles.progressFlowStep}><span>06</span><BarChart3 size={16} /></div>
            <h3>Next: Publish & learn</h3>
            <p>Approval, publishing, analytics and the learning loop are the remaining roadmap stages.</p>
          </article>
        </div>
      </section>

      <section className={styles.progressTimeline} aria-labelledby="progress-timeline-title">
        <div className={styles.progressSectionHead}><div><div className={styles.progressEyebrow}>Delivery timeline</div><h2 id="progress-timeline-title">Product phases</h2></div><span className={styles.progressNote}>Delivery status, not production readiness</span></div>
        <div className={styles.progressList}>
          {PROJECT_PHASES.map((phase, index) => {
            const done = phase.status === 'COMPLETED';
            const active = phase.status === 'IN_PROGRESS';
            return (
              <article key={phase.phase} className={[styles.progressPhase, done && styles.isDone, active && styles.isActive].filter(Boolean).join(' ')} style={{ animationDelay: Math.min(index * 45, 500) + 'ms' }}>
                <div className={styles.progressPhaseRail}>
                  <div className={styles.progressPhaseNode}>{done ? <CheckCircle2 size={16} /> : active ? <ArrowRight size={16} /> : <span />}</div>
                  {index < PROJECT_PHASES.length - 1 ? <div className={styles.progressPhaseLine} /> : null}
                </div>
                <div className={styles.progressPhaseCard}>
                  <div className={styles.progressPhaseHead}>
                    <div><div className={styles.progressPhaseKicker}>Phase {String(phase.phase).padStart(2, '0')}</div><h3>{phase.title}</h3></div>
                    <span className={[styles.progressStatus, done ? styles.statusDone : active ? styles.statusActive : styles.statusPending].join(' ')}>{done ? 'Completed' : active ? 'In progress' : 'Pending'}</span>
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