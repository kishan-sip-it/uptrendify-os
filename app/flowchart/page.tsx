import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, GitBranch, Workflow } from 'lucide-react';
import { DataFlowDiagram } from '@/components/dfd/data-flow-diagram';
import styles from './flowchart.module.css';

export const metadata: Metadata = {
  title: 'Application Flowchart — UpTrendifyOS',
  description: 'Interactive 3D flowchart of the real UpTrendifyOS workflow from brand setup to research, review, strategy and publishing.',
};

export default function FlowchartPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}><span /> PRODUCT WORKFLOW · INTERACTIVE 3D</div>
        <div className={styles.heroGrid}>
          <div>
            <h1>How UpTrendifyOS <em>works</em></h1>
            <p>Follow the actual product journey: set up a brand, scan its public website, research source evidence, review Brand Brain suggestions, approve facts, generate strategy, create content and campaigns, then approve and prepare publishing. Select any node to inspect what it does and what must happen before the next stage.</p>
            <div className={styles.pills}><span><CheckCircle2 size={14} /> Human approval gates</span><span><GitBranch size={14} /> Branches & recovery paths</span><span><ArrowRight size={14} /> Directed workflow</span></div>
          </div>
          <aside className={styles.keyCard}>
            <strong>How to read this flowchart</strong>
            <p><b>Solid arrows</b> show the normal order of work and saved results.</p>
            <p><b>Decision gates</b> show where evidence, validation or human approval is required.</p>
            <p><b>Fallback paths</b> show optional recovery when a public site or AI provider is unavailable.</p>
          </aside>
        </div>
      </header>
      <section className={styles.diagram} aria-label="Interactive three-dimensional UpTrendifyOS workflow">
        <DataFlowDiagram />
      </section>
      <footer className={styles.note}>The map describes the implemented product flow, not a guarantee that every external website or AI provider will succeed. Research may be partial when public sources are blocked; strategy depends on approved Brand Brain facts; publishing remains queued until a real channel connection is available.</footer>
    </main>
  );
}
