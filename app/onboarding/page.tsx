'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/ui/feedback';
import { AuthLayout } from '@/components/auth/auth-layout';
import { GuidedTour } from '@/components/tours/GuidedTour';
import { BrandWebsiteSuggestions } from '@/components/brand/website-suggestions';
import { completedStepsWith, mergeOnboardingDraft } from '@/lib/onboarding/state';
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
  secondaryAudience: string;
  offer: string;
  valueProposition: string;
  differentiators: string;
  coreMessage: string;
  messagingPillars: string;
  tone: string;
  primaryColor: string;
  wordsToUse: string;
  wordsToAvoid: string;
  restrictions: string;
};

const EMPTY_DRAFT: Draft = {
  workspaceType: 'AGENCY', workspaceName: '', timezone: 'UTC', firstName: '', lastName: '',
  teamSize: '', brandId: null, brandName: '', websiteUrl: '', description: '', industry: '',
  primaryAudience: '', secondaryAudience: '', offer: '', valueProposition: '', differentiators: '',
  coreMessage: '', messagingPillars: '', tone: '', primaryColor: '#6ee7c7',
  wordsToUse: '', wordsToAvoid: '', restrictions: '',
};

const STEPS = [
  { key: 'workspace', label: 'Workspace', title: 'How will you use UpTrendifyOS?', body: 'Choose the workspace model that matches how your team works.' },
  { key: 'profile', label: 'Profile', title: 'Set up your workspace', body: 'A few details help personalize your workspace and scheduling.' },
  { key: 'brand', label: 'Brand', title: 'Add the brand you want to grow', body: 'This is the business identity UpTrendifyOS will research and help you market.' },
  { key: 'rules', label: 'Brand rules', title: 'Give AI the rules it must respect', body: 'Human-entered brand guidance is authoritative. AI intelligence can build on it, not silently replace it.' },
  { key: 'review', label: 'Review', title: 'Review your setup', body: 'Check the basics once before the workflow starts.' },
  { key: 'research', label: 'Start research', title: 'You are ready to begin', body: 'UpTrendifyOS will research the public website, build Brand Intelligence, and bring you to the next step.' },
] as const;

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Asia/Tokyo'];


export default function OnboardingPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState('');
  const [resumable, setResumable] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveControllerRef = useRef<AbortController | null>(null);

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
          setStep(Math.min(5, Math.max(0, Number(body?.progress?.current_step ?? 0))));
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
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
    setError('');
  };

  useEffect(() => {
    if (loading || saving) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveControllerRef.current?.abort();
      const controller = new AbortController();
      autosaveControllerRef.current = controller;

      void fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, completed: false, data: draft }),
        signal: controller.signal,
      }).catch(() => undefined);
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

  async function jumpToStep(nextStep: number) {
    if (nextStep >= step || nextStep < 0 || saving || researching) return;
    setError('');
    setStep(nextStep);
    void saveProgress(nextStep, false).catch((error) => {
      setError(error instanceof Error ? error.message : 'Could not save your progress');
    });
  }

  async function saveProgress(nextStep = step, completed = false, complete = false) {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveControllerRef.current?.abort();
    autosaveControllerRef.current = null;

    const response = await fetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: nextStep, completed, complete, data: draft }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Your session expired. Sign in again to continue.');
    }
    if (!response.ok) throw new Error(body?.error || 'We could not save your onboarding progress. Please try again.');
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

  async function saveBrand() {
    const response = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientName: draft.workspaceName.trim() || draft.brandName.trim(),
        brandName: draft.brandName.trim(),
        websiteUrl: draft.websiteUrl.trim(),
        industry: draft.industry.trim() || undefined,
        targetAudience: draft.primaryAudience.trim() || undefined,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'Could not create your brand');
    setDraft((currentDraft) => ({ ...currentDraft, brandId: String(body.brand.id) }));
  }

  async function saveRules() {
    if (!draft.brandId) throw new Error('Create the brand before saving its rules');
    const response = await fetch('/api/brands/' + draft.brandId, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description: draft.description.trim() || null,
        industry: draft.industry.trim() || null,
        targetAudience: draft.primaryAudience.trim() || null,
        audienceDetails: { secondaryAudience: draft.secondaryAudience.trim() || null },
        offerDetails: { coreOffer: draft.offer.trim() || null },
        positioning: { valueProposition: draft.valueProposition.trim() || null, differentiators: draft.differentiators.split('\n').map((v) => v.trim()).filter(Boolean) },
        messaging: { coreMessage: draft.coreMessage.trim() || null, pillars: draft.messagingPillars.split('\n').map((v) => v.trim()).filter(Boolean), tone: draft.tone.trim() || null, wordsToUse: draft.wordsToUse.split('\n').map((v) => v.trim()).filter(Boolean), wordsToAvoid: draft.wordsToAvoid.split('\n').map((v) => v.trim()).filter(Boolean), restrictions: draft.restrictions.trim() || null },
        primaryColor: draft.primaryColor || null,
        visualIdentity: { primaryColor: draft.primaryColor || null },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || 'Could not save brand rules');
  }

  async function next() {
    setSaving(true);
    setError('');
    try {
      if (step === 0) {
        if (draft.workspaceName.trim().length < 2) throw new Error('Give your workspace a name.');
        await saveProgress(1, true);
      } else if (step === 1) {
        if (!draft.firstName.trim()) throw new Error('Enter your first name.');
        await saveWorkspaceAndProfile();
        await saveProgress(2, true);
      } else if (step === 2) {
        if (draft.brandName.trim().length < 2) throw new Error('Enter a brand name.');
        if (!/^https?:\/\//i.test(draft.websiteUrl.trim())) throw new Error('Use a complete website URL starting with https:// or http://.');
        if (!draft.brandId) await saveBrand();
        await saveProgress(3, true);
      } else if (step === 3) {
        await saveRules();
        await saveProgress(4, true);
      } else if (step === 4) {
        await saveProgress(5, true);
      }
      if (step < 5) setStep((value) => Math.min(5, value + 1));
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
    if (!draft.brandId) { setError('Your brand has not been created yet. Go back to the Brand step.'); return; }
    setResearching(true);
    setError('');
    try {
      await saveRules();
      await saveProgress(5, true, true);
      const research = await fetch('/api/brands/' + draft.brandId + '/research', {
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
    ['Audience', draft.primaryAudience || 'Not set'],
    ['Primary color', draft.primaryColor || 'Not set'],
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
            <div className="choice-grid" id="onboarding-workspace">
              <button type="button" className={'choice-card ' + (draft.workspaceType === 'AGENCY' ? 'selected' : '')} onClick={() => update('workspaceType', 'AGENCY')}>
                <span className="choice-kicker">Agency</span><strong>Manage multiple brands</strong><span>Use one workspace for teams, clients, research, strategy, content and campaigns.</span>
              </button>
              <button type="button" className={'choice-card ' + (draft.workspaceType === 'BUSINESS' ? 'selected' : '')} onClick={() => update('workspaceType', 'BUSINESS')}>
                <span className="choice-kicker">Business</span><strong>Grow your own brand</strong><span>Use a workspace primarily for your own company and brand.</span>
              </button>
              <label className="span-2">Workspace name<input value={draft.workspaceName} onChange={(e) => update('workspaceName', e.target.value)} placeholder={draft.workspaceType === 'AGENCY' ? 'e.g. Northstar Marketing' : 'e.g. Aurora Labs'} autoFocus /></label>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-grid">
              <label>First name<input value={draft.firstName} onChange={(e) => update('firstName', e.target.value)} autoFocus /></label>
              <label>Last name<input value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} /></label>
              <label>Team size<input value={draft.teamSize} onChange={(e) => update('teamSize', e.target.value)} placeholder="e.g. 5" /></label>
              <label>Timezone<select value={draft.timezone} onChange={(e) => update('timezone', e.target.value)}>{TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}</select><small className="field-help">Used for campaign dates, publishing schedules and reporting day boundaries.</small></label>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-grid">
              <label className="brand-field">
              <span>Brand name</span>
              <div className="brand-suggestion-wrap">
                <input className="brand-input" value={draft.brandName} onChange={(e) => update('brandName', e.target.value)} placeholder="e.g. AURORA Labs" autoFocus autoComplete="organization" />
                <BrandWebsiteSuggestions query={draft.brandName} onSelect={(name, url) => { update('brandName', name); update('websiteUrl', url); }} />
              </div>
              <small>Start typing the company name and choose the public website when it appears.</small>
            </label>
              <label>Website<input value={draft.websiteUrl} onChange={(e) => update('websiteUrl', e.target.value)} placeholder="https://example.com" /></label>
              <label>Industry<input value={draft.industry} onChange={(e) => update('industry', e.target.value)} placeholder="e.g. SaaS" /></label>
              <label>Primary audience<textarea value={draft.primaryAudience} onChange={(e) => update('primaryAudience', e.target.value)} rows={4} placeholder="Who should this brand reach?" /></label>
              <label className="span-2">What does the brand do?<textarea value={draft.description} onChange={(e) => update('description', e.target.value)} rows={4} placeholder="Describe the business in your own words." /></label>
              <p className="field-note">Brand name, website and rules stay editable later from the brand workspace.</p>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-grid">
              <label>Secondary audience<textarea value={draft.secondaryAudience} onChange={(e) => update('secondaryAudience', e.target.value)} rows={3} /></label>
              <label>Core offer<textarea value={draft.offer} onChange={(e) => update('offer', e.target.value)} rows={3} /></label>
              <label>Value proposition<textarea value={draft.valueProposition} onChange={(e) => update('valueProposition', e.target.value)} rows={3} /></label>
              <label>Differentiators<textarea value={draft.differentiators} onChange={(e) => update('differentiators', e.target.value)} rows={3} placeholder="One per line" /></label>
              <label>Core message<textarea value={draft.coreMessage} onChange={(e) => update('coreMessage', e.target.value)} rows={3} /></label>
              <label>Messaging pillars<textarea value={draft.messagingPillars} onChange={(e) => update('messagingPillars', e.target.value)} rows={3} placeholder="One per line" /></label>
              <label>Tone / communication style<input value={draft.tone} onChange={(e) => update('tone', e.target.value)} placeholder="e.g. direct, optimistic, expert" /></label>
              <label>Primary brand color<input type="color" value={draft.primaryColor} onChange={(e) => update('primaryColor', e.target.value)} /></label>
              <label>Words to use<textarea value={draft.wordsToUse} onChange={(e) => update('wordsToUse', e.target.value)} rows={3} placeholder="One per line" /></label>
              <label>Words to avoid<textarea value={draft.wordsToAvoid} onChange={(e) => update('wordsToAvoid', e.target.value)} rows={3} placeholder="One per line" /></label>
              <label className="span-2">Restrictions / claims to avoid<textarea value={draft.restrictions} onChange={(e) => update('restrictions', e.target.value)} rows={4} /></label>
            </div>
          )}

          {step === 4 && (
            <div className="review-grid">
              {reviewItems.map(([label, value]) => <div className="review-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
              <div className="review-note"><strong>These rules are human-authored.</strong><span>Research adds evidence separately. Brand Brain suggestions still require human approval before strategy can use them as authoritative facts.</span></div>
            </div>
          )}

          {step === 5 && (
            <div className="finish-card">
              <div className="finish-icon"><Rocket size={24} /></div>
              <div><div className="eyebrow">Next: Research</div><h2>Start with evidence, not guesses.</h2><p className="subtitle">Finish setup queues research immediately. The research workspace will show progress while the website is crawled and analyzed.</p></div>
              <div className="workflow-mini"><span>1 Research</span><span>2 Brand Intelligence</span><span>3 Strategy</span><span>4 Content</span><span>5 Campaigns</span><span>6 Approval</span><span>7 Publishing</span></div>
            </div>
          )}

          {error && <div style={{ marginTop: 14 }}><ErrorState message={error} /></div>}

          <div className="onboarding-actions" id="onboarding-actions" style={{ marginTop: 18, position: 'relative', zIndex: 3 }}>
            <button type="button" className="badge" onClick={back} disabled={step === 0 || saving || researching} style={{ border: 0, cursor: step === 0 ? 'not-allowed' : 'pointer' }}><ArrowLeft size={15} /> Back</button>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {step < 5 ? <button type="button" className="badge auth-submit" onClick={next} disabled={saving || researching}>{saving ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <>Save & continue <ArrowRight size={15} /></>}</button> : <button type="button" className="badge auth-submit" onClick={finishAndResearch} disabled={researching}>{researching ? <><LoaderCircle size={15} className="spin" /> Starting research…</> : <>Finish setup & start research <Rocket size={15} /></>}</button>}
            </div>
          </div>
          {resumable && <p className="field-note"><Check size={13} /> Your progress is saved. You can close the browser and resume here.</p>}
        </section>
      </div>
      <GuidedTour
        stageKey="onboarding"
        steps={[
          { target: '#onboarding-workspace', title: 'Choose how you will use UpTrendifyOS', body: 'Agency workspaces can manage multiple brands. Business workspaces are designed primarily around your own brand.' },
          { target: '#onboarding-stepper', title: 'Your setup is resumable', body: 'Each step is saved. You can go back, refresh, or close the browser without losing the information you entered.' },
          { target: '#onboarding-actions', title: 'Save and continue when you are ready', body: 'The final action explicitly starts Research. You will see the research status after setup finishes.' },
        ]}
      />
    </AuthLayout>
  );
}
