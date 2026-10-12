import type { Metadata } from 'next';
import { Network, Workflow } from 'lucide-react';
import { DataFlowDiagram } from '@/components/dfd/data-flow-diagram';
import styles from './flowchart.module.css';

export const metadata: Metadata = {
  title: 'Application Flowchart — UpTrendifyOS',
  description: 'Interactive 3D map of the UpTrendifyOS application workflow and website identity scan.',
};

export default function FlowchartPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}><span /> APPLICATION MAP · INTERACTIVE 3D</div>
        <div className={styles.heroGrid}>
          <div>
            <h1>How UpTrendifyOS <em>works</em></h1>
            <p>Explore the path from a client brand and public website to research evidence, human-approved Brand Brain facts, strategy, and downstream delivery. Select a node to inspect its role; switch diagram levels to zoom into the full system or the website scanner.</p>
            <div className={styles.pills}><span><Workflow size={14} /> End-to-end workflow</span><span><Network size={14} /> Data & decision paths</span></div>
          </div>
          <aside className={styles.keyCard}>
            <strong>How to read this map</strong>
            <p><b>Level 0</b> — platform boundary and external services.</p>
            <p><b>Level 1</b> — main application processes and saved data.</p>
            <p><b>Level 2</b> — website identity scan, validation, visual evidence and persistence.</p>
          </aside>
        </div>
      </header>
      <section className={styles.diagram} aria-label="Interactive three-dimensional application flow diagram">
        <DataFlowDiagram />
      </section>
      <footer className={styles.note}>This is an application/data-flow map, not a claim that every optional feature is enabled in every workspace. Website access, AI-provider availability and human approval can affect the path.</footer>
    </main>
  );
}
