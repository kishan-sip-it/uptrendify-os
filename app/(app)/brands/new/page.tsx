'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { SuccessState } from '@/components/ui/feedback';
import { useRouter } from 'next/navigation';
import { BrandIntake } from '@/components/brand/brand-intake';

type Status = { kind: 'success' | 'error' | 'idle'; message: string };

export default function NewBrandPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const router = useRouter();
  const [createdBrandId, setCreatedBrandId] = useState('');
  const [workspace, setWorkspace] = useState<{ name: string; workspace_type: 'AGENCY' | 'BUSINESS' } | null>(null);

  useEffect(() => {
    fetch('/api/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (body?.workspace) setWorkspace(body.workspace); })
      .catch(() => undefined);
  }, []);

  return (
    <main className="main" style={{ maxWidth: 1120 }}>
      <a href="/dashboard" className="metric-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ArrowLeft size={15}/> Back to command center</a>
      <div className="brand-form-header" style={{ marginTop: 24 }}>
        <div className="eyebrow">Brand onboarding</div>
        <h1>Give the workspace a brand people can recognize.</h1>
        <p className="subtitle">{workspace ? `${workspace.name} · ${workspace.workspace_type === 'AGENCY' ? 'Agency workspace' : 'Business workspace'} · ` : ''}Start with the public website. We import the brand identity it actually declares, then you review and edit it before research continues.</p>
        {workspace?.workspace_type === 'BUSINESS' ? (
          <div className="card" style={{ marginTop: 14, padding: 14 }}>
            <div className="eyebrow">Business workspace</div>
            <strong>One active brand</strong>
            <p className="subtitle" style={{ margin: '5px 0 0' }}>Business workspaces focus on one primary brand. Switch the workspace to Agency to manage multiple brands.</p>
          </div>
        ) : null}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <BrandIntake
          onCreated={(brandId) => {
            setCreatedBrandId(brandId);
            setStatus({ kind: 'success', message: 'Brand created, complete Brand IQ imported, and research started. Opening the Brand Profile…' });
            window.setTimeout(() => router.replace('/brands/' + brandId + '?view=profile'), 400);
          }}
        />
        {status.kind === 'success' ? (
          <div style={{ marginTop: 14 }}>
            <SuccessState message={status.message} />
            {createdBrandId ? <a className="badge" href={'/brands/' + createdBrandId + '?view=profile'} style={{ marginTop: 10 }}><CheckCircle2 size={14} /> Open brand profile</a> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
