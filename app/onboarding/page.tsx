'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LogOut, Rocket, ShieldCheck, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';
import { GuidedTour } from '@/components/tours/GuidedTour';
import { BrandIntake } from '@/components/brand/brand-intake';
import { completedStepsWith, mergeOnboardingDraft } from '@/lib/onboarding/state';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { normalizeTimezone } from '@/lib/timezone';

type Draft = {
  workspaceType: 'AGENCY' | 'BUSINESS';
  workspaceName: string;
  timezone: string;
  firstName: string;
  lastName: string;
  teamSize: string;
  brandId: string | null;
  brandName: string;
  websiteUrl: string;
  description: string;
  industry: string;
  primaryAudience: string;
};

const EMPTY_DRAFT: Draft = {
  workspaceType: 'AGENCY', workspaceName: '', timezone: 'UTC', firstName: '', lastName: '',
  teamSize: '', brandId: null, brandName: '', websiteUrl: '', description: '', industry: '',
  primaryAudience: '',
};

const STEPS = [
  { key: 'brand', label: 'Website', title: 'Start with your website', body: 'Enter the public website. UpTrendifyOS will analyze it and import the resulting Brand IQ instead of asking you to repeat the same information manually.' },
  { key: 'workspace', label: 'Workspace', title: 'How will you use UpTrendifyOS?', body: 'Choose the workspace model that matches how your team works.' },
  { key: 'profile', label: 'Profile', title: 'Set up your workspace', body: 'A few details help personalize your workspace and scheduling.' },
  { key: 'review', label: 'Review', title: 'Review your setup', body: 'Check the basics once before the workflow starts.' },
  { key: 'research', label: 'Start research', title: 'You are ready to begin', body: 'UpTrendifyOS will research the public website, build Brand Intelligence, and bring you to the next step.' },
] as const;

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Asia/Tokyo'];

const ROLE_CONTEXT: Record<string, { title: string; body: string; action: string }> = {
  OWNER: { title: 'You are the workspace owner', body: 'You will control workspace settings, brands, team access and the final human gates.', action: 'You can invite teammates and delegate work later.' },
  ADMIN: { title: 'You are a workspace admin', body: 'You will help manage brands, team operations and the workflow without taking ownership away from the owner.', action: 'Your permissions stay server-enforced.' },
  STRATEGIST: { title: 'Your focus is strategy', body: 'Your setup will feed the research → Brand Brain → Strategy path so you can turn approved evidence into a plan.', action: 'You can review Brand Brain and generate strategy where permitted.' },
  EDITOR: { title: 'Your focus is execution', body: 'Your workspace will surface approved context for Content Studio and campaign execution.', action: 'You will work from the same approved Brand Brain and strategy.' },
  APPROVER: { title: 'Your focus is approval', body: 'You will see the workflow context and the exact content versions waiting for a decision.', action: 'Approval remains a distinct human gate.' },
  CLIENT: { title: 'You are joining as a client', body: 'Your workspace view is focused on seeing prepared work and the decisions that need your attention.', action: 'Editing and generation permissions stay restricted by role.' },
};


export default function OnboardingPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState('');
  const [resumable, setResumable] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<string>('OWNER');
  const autosaveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const current = STEPS[step];
  const progressPercent = Math.round((step / (STEPS.length - 1)) * 100);

  useEffect(() => {
    let cancelled = false;

    async function loadOnboarding() {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch('/api/onboarding', { cache: 'no-store' });
          const body = await response.json().catch(() => null);

          if (response.status === 401) {
            window.location.href = '/login';
            return;
          }

          if (!response.ok) {
            throw new Error(body?.error || 'Could not load onboarding');
          }

          const stored = mergeOnboardingDraft(EMPTY_DRAFT, body?.progress?.draft_data);
          const timezone = normalizeTimezone(
            body?.organization?.timezone ||
              body?.profile?.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              'UTC',
          );
          const next = {
            ...stored,
            timezone,
            firstName: stored.firstName || body?.profile?.first_name || '',
            lastName: stored.lastName || body?.profile?.last_name || '',
          };

          if (cancelled) return;
          setDraft(next);
          setWorkspaceRole(String(body?.role || 'OWNER'));
          const storedStep = Number(body?.progress?.current_step ?? 0);
          // Legacy onboarding had a dedicated Brand Rules step. Map that old
          // step and the old Review/Research indices onto the new five-step flow
          // without making a user repeat completed setup.
          const nextStep = storedStep >= 3 ? Math.min(3, storedStep - 1) : storedStep;
          setStep(Math.min(STEPS.length - 1, Math.max(0, nextStep)));
          setResumable(Boolean(body?.progress));
          setLoading(false);
          setError('');
          return;
        } catch (error) {
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            continue;
          }
          if (cancelled) return;

          // The onboarding UI remains usable during a transient read failure.
          // Save & continue will retry the authoritative server write.
          setDraft({ ...EMPTY_DRAFT });
          setStep(0);
          setResumable(false);
          setLoading(false);
          setError('');
        }
      }
    }

    void loadOnboarding();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (key === 'primaryColor') primaryColorSourceRef.current = 'manual';
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
    setError('');
  };

  useEffect(() => {
    if (loading || saving) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveProgress(step, false).catch(() => undefined);
    }, 450);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [draft, step, loading, saving]);

  useEffect(() => {
    if (loading) return;
    const persistBeforeLeave = () => {
      void fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, completed: false, data: draft }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', persistBeforeLeave);
    return () => window.removeEventListener('pagehide', persistBeforeLeave);
  }, [draft, step, loading]);

  async function switchAccount() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.location.href = '/login';
    }
  }

  async function jumpToStep(nextStep: number) {
    if (nextStep >= step || nextStep < 0 || saving || researching) return;
    setError('');
    setStep(nextStep);
    void saveProgress(nextStep, false).catch((error) => {
      setError(error instanceof Error ? error.message : 'Could not save your progress');
    });
  }

  async function saveProgress(
    nextStep = step,
    completed = false,
    complete = false,
    dataOverride?: Draft,
  ) {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const snapshot = dataOverride ?? draft;
    const previous = saveQueueRef.current;
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch('/api/onboarding', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step: nextStep, completed, complete, data: snapshot }),
        });
        const body = await response.json().catch(() => null);
        if (response.status === 401) {
          window.location.href = '/login';
          throw new Error('Your session expired. Sign in again to continue.');
        }
        if (!response.ok) {
          throw new Error(body?.error || 'We could not save your onboarding progress. Please try again.');
        }
      });

    saveQueueRef.current = task.catch(() => undefined);
    return task;
  }

  async function saveWorkspaceAndProfile() {
    const workspace = await fetch('/api/workspace', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: draft.workspaceName.trim(), workspaceType: draft.workspaceType, timezone: draft.timezone }),
    });
    const workspaceBody = await workspace.json().catch(() => null);
    if (!workspace.ok) throw new Error(workspaceBody?.error || 'Could not save workspace');

    const profile = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim() || null, teamSize: draft.teamSize.trim() || null, timezone: draft.timezone }),
    });
    const profileBody = await profile.json().catch(() => null);
    if (!profile.ok) throw new Error(profileBody?.error || 'Could not save your profile');
  }

 async function next() {
    setSaving(true);
    setError('');
    try {
      if (step === 0) {
        return;
      } else if (step === 1) {
        if (draft.workspaceName.trim().length < 2) throw new Error('Give your workspace a name.');
        await saveProgress(2, true);
      } else if (step === 2) {
        if (!draft.firstName.trim()) throw new Error('Enter your first name.');
        await saveWorkspaceAndProfile();
        await saveProgress(3, true);
      } else if (step === 3) {
        await saveProgress(4, true);
      }
      if (step < STEPS.length - 1) setStep((value) => Math.min(STEPS.length - 1, value + 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue');
    } finally {
      setSaving(false);
    }
  }

  async function back() {
    if (step === 0 || saving || researching) return;
    const previous = step - 1;
    setError('');
    setStep(previous);
    void saveProgress(previous, false).catch((error) => {
      setError(error instanceof Error ? error.message : 'Could not save your progress');
    });
  }

  async function finishAndResearch() {
    if (!draft.brandId) { setError('Your brand has not been created yet. Go back to the Website step.'); return; }
    setResearching(true);
    setError('');
    try {
      await saveProgress(4, true, true);      const research = await fetch('/api/brands/' + draft.brandId + '/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await research.json().catch(() => null);
      if (!research.ok && research.status !== 409) throw new Error(body?.error || 'Could not start research');
      router.replace('/brands/' + draft.brandId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start research');
    } finally {
      setResearching(false);
    }
  }

  const reviewItems = useMemo(() => [
    ['Workspace', draft.workspaceName || 'Not set'],
    ['Workspace type', draft.workspaceType === 'AGENCY' ? 'Agency' : 'Business'],
    ['Brand', draft.brandName || 'Not set'],
    ['Website', draft.websiteUrl || 'Not set'],
    ['Audience', draft.primaryAudience || 'Imported from website analysis'],
    ['Timezone', draft.timezone || 'Not set'],
  ], [draft]);

  if (loading) return <AuthLayout eyebrow="Setup" title="Preparing your workspace." subtitle="Your progress is saved as you move." footer={null}><LoadingState label="Loading onboarding…" /></AuthLayout>;

  return (
    <AuthLayout eyebrow={'Step ' + (step + 1) + ' of ' + STEPS.length} title={current.title} subtitle={current.body} footer={null}>
      <div className="onboarding-shell">
        <div className="onboarding-stepper" id="onboarding-stepper" aria-label={'Onboarding progress: ' + current.label}>
          <div className="onboarding-stepper-track"><span style={{ width: progressPercent + '%' }} /></div>
          <div className="onboarding-stepper-items">
            {STEPS.map((item, index) => (
              <button type="button" key={item.key} className={'onboarding-step-node ' + (index === step ? 'current ' : '') + (index < step ? 'done' : '')} onClick={() => void jumpToStep(index)} aria-label={item.label}>
                <span className="onboarding-step-number">{index < step ? <Check size={13} /> : index + 1}</span><span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <section className="card onboarding-card">
          {step === 0 && (
            <div id="onboarding-brand">
              <BrandIntake
                initialWebsite={draft.websiteUrl}
                initialBrandName={draft.brandName}
                startResearch={false}
                showReview={false}
                onCreated={(brandId, details) => {
                  const nextDraft = { ...draft, brandId, brandName: details?.brandName || draft.brandName, websiteUrl: details?.websiteUrl || draft.websiteUrl };
                  setDraft(nextDraft);
                  setError('');
                  void saveProgress(1, true, false, nextDraft)
                    .then(() => setStep(1))
                    .catch((error) => setError(error instanceof Error ? error.message : 'Could not save your onboarding progress'));
                }}
              />
            </div>
          )}

          {step === 1 && (
            <div id="onboarding-workspace">
              <div className="choice-grid">
                <button type="button" className={'choice-card ' + (draft.workspaceType === 'AGENCY' ? 'selected' : '')} onClick={() => update('workspaceType', 'AGENCY')}>
                  <span className="choice-kicker">Agency</span><strong>Manage multiple brands</strong><span>Use one workspace for teams, clients, research, strategy, content and campaigns.</span>
                </button>
                <button type="button" className={'choice-card ' + (draft.workspaceType === 'BUSINESS' ? 'selected' : '')} onClick={() => update('workspaceType', 'BUSINESS')}>
                  <span className="choice-kicker">Business</span><strong>Grow your own brand</strong><span>Use a workspace primarily for your own company and brand.</span>
                </button>
                <label className="span-2">Workspace name<input value={draft.workspaceName} onChange={(e) => update('workspaceName', e.target.value)} placeholder={draft.workspaceType === 'AGENCY' ? 'e.g. Northstar Marketing' : 'e.g. Aurora Labs'} autoFocus /></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="onboarding-role-context">
                <div className="onboarding-role-icon"><Users size={16} /></div>
                <div>
                  <div className="eyebrow">{ROLE_CONTEXT[workspaceRole]?.title ?? 'Workspace role'}</div>
                  <strong>{ROLE_CONTEXT[workspaceRole]?.body ?? 'Your permissions and next actions are tailored to your workspace role.'}</strong>
                  <span>{ROLE_CONTEXT[workspaceRole]?.action ?? 'Permissions remain server-enforced.'}</span>
                </div>
              </div>
              <div className="onboarding-grid">
                <label>First name<input value={draft.firstName} onChange={(e) => update('firstName', e.target.value)} autoFocus /></label>
                <label>Last name<input value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} /></label>
                <label>Team size<input value={draft.teamSize} onChange={(e) => update('teamSize', e.target.value)} placeholder="e.g. 5" /></label>
                <label>Timezone<select value={draft.timezone} onChange={(e) => update('timezone', e.target.value)}>{TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}</select><small className="field-help">Used for campaign dates, publishing schedules and reporting day boundaries.</small></label>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="review-grid">
              {reviewItems.map(([label, value]) => <div className="review-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
              <div className="review-note"><strong>Your website analysis is already imported.</strong><span>Brand identity, audience, messaging and visual signals are available in the Brand Profile, where you can edit them before they become active working context.</span></div>
              <div className="review-note onboarding-role-review"><ShieldCheck size={15} /><span><strong>{ROLE_CONTEXT[workspaceRole]?.title ?? 'Your workspace role'}</strong> — {ROLE_CONTEXT[workspaceRole]?.body ?? 'Your available actions follow your server-side workspace permissions.'}</span></div>
            </div>
          )}

          {step === 4 && (
            <div className="finish-card">
              <div className="finish-icon"><Rocket size={24} /></div>
              <div><div className="eyebrow">Next: Research</div><h2>Start with evidence, not guesses.</h2><p className="subtitle">Finish setup queues research immediately. The research workspace will show progress while the website is crawled and analyzed.</p></div>
              <div className="workflow-mini"><span>1 Research</span><span>2 Brand Intelligence</span><span>3 Strategy</span><span>4 Content</span><span>5 Campaigns</span><span>6 Approval</span><span>7 Publishing</span></div>
            </div>
          )}

          {error && <div style={{ marginTop: 14 }}><ErrorState message={error} /></div>}

          <div className="onboarding-actions" id="onboarding-actions" style={{ marginTop: 18, position: 'relative', zIndex: 3 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="badge" onClick={back} disabled={step === 0 || saving || researching} style={{ border: 0, cursor: step === 0 ? 'not-allowed' : 'pointer' }}><ArrowLeft size={15} /> Back</button>
              <button type="button" className="badge" onClick={() => void switchAccount()} disabled={saving || researching} style={{ border: 0, cursor: saving || researching ? 'not-allowed' : 'pointer' }} aria-label="Sign out and use a different account"><LogOut size={15} /> Use different account</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {step > 0 && step < STEPS.length - 1 ? <button type="button" className="badge auth-submit" onClick={next} disabled={saving || researching}>{saving ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <>Save & continue <ArrowRight size={15} /></>}</button> : null}
              {step === STEPS.length - 1 ? <button type="button" className="badge auth-submit" onClick={finishAndResearch} disabled={researching}>{researching ? <><LoaderCircle size={15} className="spin" /> Starting research…</> : <>Finish setup & start research <Rocket size={15} /></>}</button> : null}
            </div>
          </div>
          {resumable && <p className="field-note"><Check size={13} /> Your progress is saved. You can close the browser and resume here.</p>}
        </section>
      </div>
      <GuidedTour
        stageKey="onboarding"
        steps={[
          { target: '#onboarding-brand', title: 'Start with your website', body: 'Enter the public website and let the existing Brand IQ analysis extract the brand context instead of manually repeating it.' },
          { target: '#onboarding-stepper', title: 'Your setup is resumable', body: 'Each step is saved. You can go back, refresh, or close the browser without losing the information you entered.' },
          { target: '#onboarding-actions', title: 'Save and continue when you are ready', body: 'The final action explicitly starts Research. You will see the research status after setup finishes.' },
        ]}
      />
    </AuthLayout>
  );
}