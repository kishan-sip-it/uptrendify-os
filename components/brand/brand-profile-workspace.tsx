'use client';

import { useCallback, useMemo } from 'react';
import { BookOpen, Image as ImageIcon, Megaphone, Palette, Quote, Sparkles, Target, Type, Users } from 'lucide-react';
import { BrandField, BrandIdentityRow, BrandPanel, BrandSection, NotDetected, brandInitials } from './brand-profile-primitives';
import { EditableColorPalette, EditableTags, EditableTextField, normaliseClearedText, useBrandIdentityEditor } from './brand-identity-editors';
import type { BrandIdentity } from '@/lib/brand/identity-mapping';
import { TONE_OPTIONS, VOICE_AXES, describeVoice, voiceAxisValues } from '@/lib/brand/voice';

const tags = (values: string[], empty = 'Not detected from this website') =>
  values.length ? <div className="brand-tags">{values.map((value) => <span key={value} className="brand-tag">{value}</span>)}</div> : <NotDetected label={empty} />;

export function BrandProfileWorkspace({
  brandId,
  websiteUrl,
  identity,
  onRescan,
  rescanState,
}: {
  brandId: string;
  websiteUrl: string | null;
  identity: BrandIdentity;
  onRescan?: () => void;
  rescanState?: 'idle' | 'running' | 'error';
}) {
  const { save, saving, error, savedAt } = useBrandIdentityEditor(brandId);
  const paletteVars = useMemo(() => ({
    '--brand-primary': identity.primaryColor ?? identity.palette[0]?.hex ?? 'var(--accent)',
    '--brand-secondary': identity.palette.find((c) => c.role === 'secondary')?.hex ?? identity.primaryColor ?? 'var(--accent-2)',
  } as React.CSSProperties), [identity.primaryColor, identity.palette]);

  const voiceSummary = describeVoice(identity.voice);
  const axes = useMemo(() => voiceAxisValues(identity.voice), [identity.voice]);
  const axisRows = VOICE_AXES.filter((axis) => axes[axis.key] !== undefined);
  const ai = identity.aiProfile;

  const saveVisualIdentity = useCallback((next: Record<string, unknown>) => save({
    visualIdentity: {
      logoUrl: identity.logoUrl,
      faviconUrl: identity.faviconUrl,
      palette: identity.palette,
      fonts: identity.fonts,
      headingFont: identity.headingFont,
      bodyFont: identity.bodyFont,
      voice: identity.voice,
      socialProfiles: identity.socialProfiles,
      assets: identity.assets,
      aiProfile: identity.aiProfile,
      crawl: identity.crawl,
      inspected: identity.inspected,
      warnings: identity.warnings,
      detectedAt: identity.detectedAt,
      ...next,
    },
  }), [save, identity]);

  const saveVoice = useCallback((voice: BrandIdentity['voice']) => saveVisualIdentity({ voice }), [saveVisualIdentity]);
  const savePalette = useCallback((palette: { hex: string; role: string }[]) => {
    const primary = palette.find((c) => c.role === 'primary')?.hex ?? palette[0]?.hex ?? null;
    return save({
      primaryColor: primary,
      secondaryColors: palette.filter((c) => c.hex !== primary).map((c) => c.hex),
      visualIdentity: {
        logoUrl: identity.logoUrl,
        faviconUrl: identity.faviconUrl,
        palette,
        fonts: identity.fonts,
        headingFont: identity.headingFont,
        bodyFont: identity.bodyFont,
        voice: identity.voice,
        socialProfiles: identity.socialProfiles,
        assets: identity.assets,
        aiProfile: identity.aiProfile,
        crawl: identity.crawl,
        inspected: identity.inspected,
        warnings: identity.warnings,
        detectedAt: identity.detectedAt,
      },
    });
  }, [save, identity]);

  return (
    <div className="brand-profile" style={paletteVars}>
      <BrandPanel
        icon={<Sparkles size={17} />}
        title="Brand Profile"
        subtitle={identity.detectedAt ? 'Imported from the website. Human edits are authoritative and become the active brand context.' : 'Brand identity for this workspace.'}
        actions={onRescan ? <button type="button" className="brand-btn" onClick={onRescan} disabled={rescanState === 'running' || saving}><Sparkles size={13} /> {rescanState === 'running' ? 'Scanning…' : 'Re-scan website'}</button> : null}
      >
        <div className="brand-strip" aria-hidden="true" />
        <BrandIdentityRow name={identity.name} websiteUrl={websiteUrl} logoUrl={identity.logoUrl} initials={brandInitials(identity.name)} />
        {savedAt && !error ? <p className="brand-section-hint" style={{ color: 'var(--status-success)' }}>Saved. Your change is now the active brand context.</p> : null}
        {error ? <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>{error}</p> : null}
      </BrandPanel>

      <BrandPanel icon={<BookOpen size={17} />} title="Brand Guidelines" subtitle="The complete working profile used by strategy and content.">
        <BrandSection title="Brand Essentials" hint="The core identity and positioning context.">
          <div className="brand-fields">
            <BrandField label="What they do" icon={<BookOpen size={14} />}><EditableTextField value={identity.description} placeholder="Describe the business." multiline onSave={(next) => save({ description: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Industry" icon={<Target size={14} />}><EditableTextField value={identity.industry} placeholder="Industry" onSave={(next) => save({ industry: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Positioning" icon={<Target size={14} />}>{identity.valueProposition ? <EditableTextField value={identity.valueProposition} placeholder="Why this brand wins" multiline onSave={(next) => save({ positioning: { valueProposition: normaliseClearedText(next) } })} /> : <NotDetected label="Not detected from this website" />}</BrandField>
            <BrandField label="Differentiators">{tags(ai?.differentiators ?? [])}</BrandField>
            <BrandField label="Business model"><span>{ai?.businessModel || <NotDetected label="Not detected from this website" />}</span></BrandField>
            <BrandField label="Market / geography"><span>{[ai?.primaryMarket, ai?.geography].filter(Boolean).join(' · ') || <NotDetected label="Not detected from this website" />}</span></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Products & Services" hint="The products, services and offers the site actually describes.">
          <div className="brand-fields">
            <BrandField label="Products">{tags(ai?.products ?? [])}</BrandField>
            <BrandField label="Services">{tags(ai?.services ?? [])}</BrandField>
            <BrandField label="Categories">{tags(ai?.productCategories ?? [])}</BrandField>
            <BrandField label="Calls to action">{tags(ai?.callsToAction ?? [])}</BrandField>
            <BrandField label="Use cases">{tags(ai?.useCases ?? [])}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Colors" hint="Actual declared palette, including external stylesheets, theme metadata and inline styles.">
          <div className="brand-fields">
            <BrandField label="Brand Colors" icon={<Palette size={14} />}><EditableColorPalette palette={identity.palette.map((c) => ({ hex: c.hex, role: c.role }))} onSave={savePalette} /></BrandField>
            <BrandField label="Fonts" icon={<Type size={14} />}>
              {identity.fonts.length ? <div><div className="brand-tags">{identity.fonts.map((font) => <span key={font.family} className="brand-tag">{font.family}<span className="brand-swatch-role">{font.source}</span></span>)}</div><div style={{ marginTop: 10, display: 'grid', gap: 8 }}><div><span className="brand-persona-fact-label">Heading font</span><EditableTextField value={identity.headingFont} placeholder="Not detected" onSave={(next) => saveVisualIdentity({ headingFont: normaliseClearedText(next) })} /></div><div><span className="brand-persona-fact-label">Body font</span><EditableTextField value={identity.bodyFont} placeholder="Not detected" onSave={(next) => saveVisualIdentity({ bodyFont: normaliseClearedText(next) })} /></div></div></div> : <NotDetected label="No font declarations found on this website" />}
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Voice & Tone" hint="The verbal identity extracted from the site's own copy, then made editable.">
          <div className="brand-fields">
            <BrandField label="Tone" icon={<Megaphone size={14} />}><EditableTags label="Tone" values={identity.voice.tone.length ? identity.voice.tone : (ai?.tone ?? [])} placeholder="Add a tone" max={3} primaryFirst suggestions={[...TONE_OPTIONS]} onSave={(next) => saveVoice({ ...identity.voice, tone: next })} /></BrandField>
            <BrandField label="Personality" icon={<Sparkles size={14} />}><EditableTags label="Personality" values={identity.voice.personality} placeholder="Add a descriptive word" suggestions={['Confident', 'Technical', 'Empowering', 'Friendly', 'Warm', 'Bold']} onSave={(next) => saveVoice({ ...identity.voice, personality: next })} /></BrandField>
            <BrandField label="Style Notes" icon={<Quote size={14} />}><EditableTextField value={identity.voice.styleNotes} placeholder="e.g. Use short sentences. Address the reader directly." multiline emptyLabel="No style notes yet" onSave={(next) => saveVoice({ ...identity.voice, styleNotes: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Common wording" icon={<Quote size={14} />}>{tags(ai?.terminology ?? identity.terminology)}</BrandField>
            <BrandField label="Recurring claims">{tags(ai?.recurringClaims ?? [])}</BrandField>
            <BrandField label="Messaging themes">{tags(ai?.messagingThemes ?? [])}</BrandField>
          </div>
          {voiceSummary || axisRows.length ? <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>{voiceSummary ? <div className="brand-voice-summary">Your brand voice is: {voiceSummary}</div> : null}{axisRows.length ? <div className="brand-voice-axes">{axisRows.map((axis) => { const value = axes[axis.key] ?? 0; return <div key={axis.key} className="brand-axis"><span>{axis.left}</span><div className="brand-axis-track" role="img" aria-label={`${axis.left} to ${axis.right}: ${Math.round(value * 100)} percent toward ${axis.right}`}><span className="brand-axis-fill" style={{ width: `${value * 100}%` }} /><span className="brand-axis-knob" style={{ left: `${value * 100}%` }} /></div><span className="brand-axis-end">{axis.right}</span></div>; })}</div> : null}</div> : null}
        </BrandSection>

        <BrandSection title="Audience" hint="Target audience, segments, needs and use cases.">
          <div className="brand-fields">
            <BrandField label="Target audience" icon={<Users size={14} />}><EditableTextField value={identity.audienceSummary} placeholder="Who should this brand reach?" multiline onSave={(next) => save({ audienceDetails: { summary: normaliseClearedText(next) } })} /></BrandField>
            <BrandField label="Customer types">{tags(ai?.customerTypes ?? [])}</BrandField>
            <BrandField label="Personas" icon={<Users size={14} />}>{identity.personas.length ? <div className="brand-persona-grid">{identity.personas.map((persona) => <div key={persona.name} className="brand-persona"><h4 className="brand-persona-name">{persona.name}</h4>{persona.description ? <p className="brand-persona-desc">{persona.description}</p> : null}</div>)}</div> : <NotDetected label="No distinct personas detected from this website" />}</BrandField>
            <BrandField label="Pain points">{tags(ai?.painPoints ?? [])}</BrandField>
            <BrandField label="Use cases">{tags(ai?.useCases ?? [])}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Guidelines" hint="The reusable rules and language signals that keep generated content on-brand.">
          <div className="brand-fields">
            <BrandField label="Preferred terminology">{tags(ai?.terminology ?? [])}</BrandField>
            <BrandField label="Positioning themes">{tags(ai?.positioningThemes ?? [])}</BrandField>
            <BrandField label="Messaging rules">{tags([...(ai?.recurringClaims ?? []), ...(ai?.messagingThemes ?? [])])}</BrandField>
            <BrandField label="Calls to action">{tags(ai?.callsToAction ?? [])}</BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Assets" hint="Public visual assets discovered from the website.">
          {identity.assets.length ? <div className="brand-persona-grid">{identity.assets.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="brand-persona" style={{ textDecoration: 'none' }}><div style={{ height: 110, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 10, background: 'var(--surface-muted)' }}><img src={asset.url} alt={asset.label ?? ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div><span className="brand-persona-desc" style={{ display: 'block', marginTop: 7, overflowWrap: 'anywhere' }}>{asset.label || 'Website asset'}</span></a>)}</div> : <NotDetected label="No public image assets detected" />}
        </BrandSection>

        <BrandSection title="Social & Brand Links" hint="Public profile links discovered on the site.">
          {identity.socialProfiles.length ? <div className="brand-tags">{identity.socialProfiles.map((profile) => <a key={profile.platform} href={profile.url} target="_blank" rel="noreferrer" className="brand-tag" style={{ textDecoration: 'none' }}>{profile.platform}</a>)}</div> : <NotDetected label="No social profiles detected" />}
        </BrandSection>

        <BrandSection title="Live Preview" hint="A real preview using the imported brand context, not placeholder content.">
          <div className="brand-voice-summary" style={{ background: 'color-mix(in srgb, var(--brand-primary) 12%, var(--surface))' }}><strong>{identity.name}</strong>{ai?.valueProposition ? ` — ${ai.valueProposition}` : identity.description ? ` — ${identity.description}` : ''}{(ai?.tone?.length || identity.voice.tone.length) ? <span style={{ display: 'block', marginTop: 6, opacity: .78 }}>Voice: {(identity.voice.tone.length ? identity.voice.tone : ai?.tone ?? []).join(' · ')}</span> : null}</div></BrandSection>

        <BrandSection title="Import provenance" hint="Exactly what the scanner inspected.">
          <div className="brand-fields">
            <BrandField label="Pages scanned"><span>{identity.crawl?.pageCount ?? 1}</span></BrandField>
            <BrandField label="External stylesheets"><span>{identity.crawl?.stylesheetCount ?? 0}</span></BrandField>
            <BrandField label="Evidence used">{tags(identity.inspected)}</BrandField>
            {identity.warnings.length ? <BrandField label="Warnings"><ul style={{ margin: 0, paddingLeft: 18 }}>{identity.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></BrandField> : null}
          </div>
        </BrandSection>
      </BrandPanel>
    </div>
  );
}
