import type { Metadata } from 'next';
import { Activity, ArrowDownRight, Boxes, Layers3, Network } from 'lucide-react';
import { DataFlowDiagram } from '@/components/dfd/data-flow-diagram';
import { DFD_LEVELS } from '@/lib/dfd/graphs';
import styles from './dfd.module.css';

export const metadata: Metadata = {
  title: 'System DFD — UpTrendifyOS',
  description: 'Interactive Three.js data-flow diagrams for UpTrendifyOS: context, application processes and website-scan decomposition.',
  robots: { index: false, follow: false },
};

export default function SystemDfdPage() {
  const processCount = DFD_LEVELS[1].nodes.filter((node) => node.kind === 'process').length;
  const storeCount = DFD_LEVELS[1].nodes.filter((node) => node.kind === 'store').length;
  const flowCount = DFD_LEVELS[1].edges.length;

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.kicker}><span className={styles.liveDot} /> SYSTEM ARCHITECTURE / DATA FLOW</div>
        <div className={styles.heroLayout}>
          <div>
            <h1>How data moves through <span>UpTrendifyOS</span></h1>
            <p className={styles.lede}>Explore the application as a data-flow system—from the agency request and public website evidence to research, approved brand facts, strategies and saved deliverables.</p>
          </div>
          <div className={styles.heroBadge}><Network size={17} /><span>Interactive 3D map</span><strong>DFD 0 · 1 · 2</strong></div>
        </div>
        <div className={styles.heroMetrics}>
          <div><span>Decomposition levels</span><strong>03</strong><small>Context → system → scan detail</small></div>
          <div><span>Level 1 processes</span><strong>{String(processCount).padStart(2, '0')}</strong><small>Application responsibilities</small></div>
          <div><span>Data stores</span><strong>{String(storeCount).padStart(2, '0')}</strong><small>Persisted platform state</small></div>
          <div><span>Level 1 flows</span><strong>{String(flowCount).padStart(2, '0')}</strong><small>Labelled directed exchanges</small></div>
        </div>
      </section>

      <section className={styles.diagramSection} aria-labelledby="dfd-level-heading">
        <div className={styles.sectionHeader}>
          <div><div className={styles.sectionKicker}>Choose a decomposition</div><h2 id="dfd-level-heading">Data flow explorer</h2></div>
          <span className={styles.standardNote}><Layers3 size={14} /> Standard DFD notation, rendered in 3D</span>
        </div>
        <DataFlowDiagram />
      </section>

      <section className={styles.guideGrid}>
        <article className={styles.guideCard}>
          <div className={styles.guideIcon}><Network size={17} /></div>
          <div className={styles.sectionKicker}>Level 0 · Context</div>
          <h3>One system, clear boundaries</h3>
          <p>Shows UpTrendifyOS as one process and the external parties exchanging requests, public data, model outputs and saved application state.</p>
        </article>
        <article className={styles.guideCard}>
          <div className={styles.guideIcon}><Boxes size={17} /></div>
          <div className={styles.sectionKicker}>Level 1 · Processes</div>
          <h3>Break the platform into responsibilities</h3>
          <p>Separates brand setup, website scanning, research crawling, Brand Brain review, strategy and downstream content/campaign operations, with the stores that connect them.</p>
        </article>
        <article className={styles.guideCard}>
          <div className={styles.guideIcon}><ArrowDownRight size={17} /></div>
          <div className={styles.sectionKicker}>Level 2 · Scan detail</div>
          <h3>Follow the website-scan pipeline</h3>
          <p>Traces URL safety, direct fetching, DOM/assets, deterministic visual ranking, structured AI enrichment and additive persistence—including external fallback services.</p>
        </article>
      </section>

      <div className={styles.disclaimer}><Activity size={14} /> This DFD is an architecture view inferred from the current code paths—not a live trace of every request. Optional providers are shown as external interfaces; their availability depends on environment configuration.</div>
    </main>
  );
}