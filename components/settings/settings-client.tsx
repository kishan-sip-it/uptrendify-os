'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Monitor,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
  WandSparkles,
} from 'lucide-react';
import { ThemeController } from '@/components/theme/theme-controller';
import { ErrorState, LoadingState } from '@/components/ui/feedback';

type Workspace = {
  id: string;
  name: string;
  workspace_type: 'AGENCY' | 'BUSINESS';
  timezone: string | null;
};

type Density = 'comfortable' | 'compact';

function readLocal(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function SettingsClient() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'AGENCY' | 'BUSINESS'>('AGENCY');
  const [timezone, setTimezone] = useState('UTC');
  const [density, setDensity] = useState<Density>('comfortable');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/workspace', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || 'Could not load workspace');
        return body;
      })
      .then((body) => {
        setWorkspace(body.workspace);
        setName(body.workspace.name);
        setType(body.workspace.workspace_type);
        setTimezone(body.workspace.timezone || 'UTC');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load workspace'))
      .finally(() => setLoading(false));

    const storedDensity = readLocal('uptrendify-density', 'comfortable');
    const storedMotion = readLocal('uptrendify-reduced-motion', 'false');
    setDensity(storedDensity === 'compact' ? 'compact' : 'comfortable');
    setReducedMotion(storedMotion === 'true');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try { window.localStorage.setItem('uptrendify-density', density); } catch {}
  }, [density]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
    try { window.localStorage.setItem('uptrendify-reduced-motion', String(reducedMotion)); } catch {}
  }, [reducedMotion]);

  async function saveWorkspace() {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, workspaceType: type, timezone }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Could not save workspace');
      setWorkspace(body.workspace);
      setMessage('Workspace settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save workspace');
    } finally {
      setSaving(false);
    }
  }

  async function replayGuides() {
    await fetch('/api/tours', { method: 'DELETE' }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent('uptrendify:open-guide'));
    setMessage('Guide state reset. Open any workflow page to replay its phase guide.');
  }

  function resetUi() {
    try {
      localStorage.removeItem('uptrendify-density');
      localStorage.removeItem('uptrendify-reduced-motion');
      localStorage.removeItem('uptrendify-phase-intro:dashboard');
      localStorage.removeItem('uptrendify-phase-intro:brand');
      localStorage.removeItem('uptrendify-phase-intro:content');
      localStorage.removeItem('uptrendify-phase-intro:campaigns');
      localStorage.removeItem('uptrendify-phase-intro:approvals');
      localStorage.removeItem('uptrendify-phase-intro:settings');
    } catch {}
    setDensity('comfortable');
    setReducedMotion(false);
    setMessage('Local interface preferences were reset.');
  }

  async function copyWorkspaceId() {
    if (!workspace) return;
    await navigator.clipboard?.writeText(workspace.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) return <LoadingState label="Loading workspace settings…" />;

  return (
    <div className="settings-page">
      <div className="topbar">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Workspace & preferences</h1>
          <p className="subtitle">Keep workspace identity, visual comfort, guides, team access and recovery tools in one predictable place.</p>
        </div>
      </div>

      {error ? <ErrorState message={error} /> : null}
      {message ? <div className="settings-notice"><Check size={14} /> {message}</div> : null}

      <div className="settings-grid">
        <section className="card">
          <div className="section-title">
            <div>
              <div className="eyebrow">Workspace</div>
              <h2>Workspace identity</h2>
            </div>
          </div>

          <label>Workspace name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label>Workspace type
            <select value={type} onChange={(event) => setType(event.target.value as 'AGENCY' | 'BUSINESS')}>
              <option value="AGENCY">Agency — multiple brands</option>
              <option value="BUSINESS">Business — primarily your own brand</option>
            </select>
          </label>

          <label>Timezone
            <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              <option>Asia/Kolkata</option>
              <option>UTC</option>
              <option>America/New_York</option>
              <option>Europe/London</option>
              <option>Asia/Singapore</option>
              <option>Asia/Tokyo</option>
            </select>
            <small className="field-help">Used for schedules, campaign dates and reporting day boundaries.</small>
          </label>

          <div className="settings-inline-actions">
            <button type="button" className="badge auth-submit" onClick={() => void saveWorkspace()} disabled={saving}>
              {saving ? 'Saving…' : 'Save workspace'}
            </button>
            <button type="button" className="badge" onClick={() => void copyWorkspaceId()} disabled={!workspace}>
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy workspace ID</>}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="section-title">
            <div>
              <div className="eyebrow">Appearance</div>
              <h2>Theme & comfort</h2>
            </div>
            <Monitor size={18} color="var(--muted)" />
          </div>

          <p className="subtitle">Theme changes should not reflow the page. Density and motion are local UI preferences for this browser.</p>
          <ThemeController />

          <label>Interface density
            <select value={density} onChange={(event) => setDensity(event.target.value as Density)}>
              <option value="comfortable">Comfortable — more breathing room</option>
              <option value="compact">Compact — show more at once</option>
            </select>
          </label>

          <label className="settings-toggle-row">
            <span>
              <strong>Reduced motion</strong>
              <small>Reduce animation and transition intensity.</small>
            </span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.target.checked)}
              aria-label="Reduced motion"
            />
          </label>

          <button type="button" className="badge" onClick={resetUi} style={{ marginTop: 12 }}>
            <RotateCcw size={13} /> Reset local UI preferences
          </button>
        </section>
      </div>

      <section className="card settings-tools">
        <div className="section-title">
          <div>
            <div className="eyebrow">Operations</div>
            <h2>Workspace tools</h2>
          </div>
          <Settings2 size={18} color="var(--muted)" />
        </div>

        <div className="settings-tool-grid">
          <a className="settings-tool" href="/settings/workspace/new">
            <WandSparkles size={16} />
            <span><strong>Create workspace</strong><small>Create an independent workspace and switch into it immediately.</small></span>
          </a>
          <a className="settings-tool" href="/settings/trash">
            <Trash2 size={16} />
            <span><strong>Trash & archive</strong><small>Review archived content and campaigns instead of losing track of them.</small></span>
          </a>
          <a className="settings-tool" href="/settings/team">
            <Users size={16} />
            <span><strong>Manage team</strong><small>Invite members and manage workspace roles.</small></span>
          </a>
          <button type="button" className="settings-tool" onClick={() => void replayGuides()}>
            <BookOpen size={16} />
            <span><strong>Replay GUIDE</strong><small>Reopen the phase-specific guide even after you skipped it.</small></span>
          </button>
        </div>
      </section>

      {workspace ? <p className="field-note">Workspace edits remain protected by Owner/Admin authorization. Current workspace: <strong>{workspace.name}</strong>.</p> : null}
    </div>
  );
}
