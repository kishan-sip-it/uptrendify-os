'use client';

import { useCallback, useMemo } from 'react';
import { BookOpen, Image as ImageIcon, Megaphone, Palette, Quote, Sparkles, Target, Type, Users } from 'lucide-react';
import { BrandField, BrandIdentityRow, BrandPanel, BrandSection, NotDetected, brandInitials } from './brand-profile-primitives';
import { EditableBrandRules, EditableColorPalette, EditablePersonas, EditablePrimaryColor, EditableTags, EditableTextField, normaliseClearedText, useBrandIdentityEditor } from './brand-identity-editors';
import type { BrandIdentity } from '@/lib/brand/identity-mapping';
import { readableTextOn } from '@/lib/brand/visual-extraction';
import { TONE_OPTIONS, VOICE_AXES, describeVoice, voiceAxisValues } from '@/lib/brand/voice';

const EMPTY_AI_PROFILE: NonNullable<BrandIdentity['aiProfile']> = {
  products: [], services: [], audience: null, personas: [], customerTypes: [], painPoints: [], useCases: [],
  tone: [], terminology: [], recurringClaims: [], messagingThemes: [], valueProposition: null, differentiators: [],
  positioningThemes: [], callsToAction: [], productCategories: [], businessModel: null, primaryMarket: null, geography: null, evidence: [],
};

const tags = (values: string[], empty = 'Not detected from this website') =>
  values.length ? <div className="brand-tags">{values.map((value) => <span key={value} className="brand-tag">{value}</span>)}</div> : <NotDetected label={empty} />;

function BrandLivePreview({
  identity,
  websiteUrl,
  ai,
}: {
  identity: BrandIdentity;
  websiteUrl: string | null;
  ai: NonNullable<BrandIdentity['aiProfile']> | null;
}) {
  const primary = /^#[0-9a-f]{6}$/i.test(identity.primaryColor ?? '')
    ? identity.primaryColor!
    : identity.palette[0]?.hex ?? '#2563eb';
  const text = readableTextOn(primary);

  return (
    <div className="brand-live-preview" style={{ '--preview-primary': primary, '--preview-primary-text': text } as React.CSSProperties}>
      <div className="brand-live-preview-top">
        <div className="brand-live-preview-mark">
          {identity.logoUrl ? <img src={identity.logoUrl} alt="" /> : <span>{brandInitials(identity.name)}</span>}
        </div>
        <div className="brand-live-preview-name">
          <strong>{identity.name || 'Your brand'}</strong>
          {websiteUrl ? <span>{websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span> : null}
        </div>
      </div>
      <div className="brand-live-preview-body">
        <span className="brand-live-preview-kicker">{ai?.tone?.[0] ?? identity.voice.tone[0] ?? 'Brand voice'}</span>
        <h4>{ai?.valueProposition || identity.description || 'Your brand message will appear here.'}</h4>
        <p>{identity.description || 'Edit the imported description to make this preview match how you want the brand presented.'}</p>
        <button type="button" className="brand-live-preview-cta" style={{ background: primary, color: text }} disabled>Primary brand colour</button>
      </div>
      <div className="brand-live-preview-footer">
        <span>Active brand context</span>
        <div className="brand-live-preview-swatches">{identity.palette.slice(0, 4).map((color) => <span key={color.hex} title={color.hex} style={{ background: color.hex }} />)}</div>
      </div>
    </div>
  );
}

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
  const previewPrimary = /^#[0-9a-f]{6}$/i.test(identity.primaryColor ?? '')
    ? identity.primaryColor!
    : identity.palette[0]?.hex ?? '#2563eb';
  const previewText = readableTextOn(previewPrimary);

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

  const saveAiProfile = useCallback((patch: Partial<NonNullable<BrandIdentity['aiProfile']>>) => {
    const current = ai ?? EMPTY_AI_PROFILE;
    return saveVisualIdentity({ aiProfile: { ...current, ...patch } });
  }, [ai, saveVisualIdentity]);

  const saveVoice = useCallback((voice: BrandIdentity['voice']) => saveVisualIdentity({ voice }), [saveVisualIdentity]);
  const savePalette = useCallback((palette: { hex: string; role: string }[]) => {
    const primary = palette.find((c) => c.role === 'primary')?.hex ?? identity.primaryColor ?? palette[0]?.hex ?? null;
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

  const savePrimaryColor = useCallback((primaryColor: string) => {
    const currentPrimary = identity.primaryColor;
    const nextPalette = identity.palette.some((color) => color.role === 'primary')
      ? identity.palette.map((color) => color.role === 'primary' ? { ...color, hex: primaryColor } : color)
      : [{ hex: primaryColor, role: 'primary', occurrences: 0, sources: ['user'] }, ...identity.palette.filter((color) => color.hex !== primaryColor)];
    const nextSecondary = identity.secondaryColors?.filter((color) => color !== currentPrimary && color !== primaryColor) ?? [];
    return save({
      primaryColor,
      secondaryColors: nextSecondary,
      visualIdentity: {
        logoUrl: identity.logoUrl,
        faviconUrl: identity.faviconUrl,
        palette: nextPalette,
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
    <div className="brand-profile brand-profile-layout" style={paletteVars}>
      <div className="brand-profile-main">
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
        <BrandSection title="Identity" hint="Website analysis is the starting point. Edit the imported values here before they become the active brand context.">
          <div className="brand-fields">
            <BrandField label="Brand name"><EditableTextField value={identity.name} placeholder="Brand name" onSave={(next) => save({ name: normaliseClearedText(next) ?? 'Untitled brand' })} /></BrandField>
            <BrandField label="Website"><EditableTextField value={websiteUrl} placeholder="https://example.com" onSave={(next) => save({ websiteUrl: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="What they do" icon={<BookOpen size={14} />}><EditableTextField value={identity.description} placeholder="Describe the business." multiline onSave={(next) => save({ description: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Industry" icon={<Target size={14} />}><EditableTextField value={identity.industry} placeholder="Industry" onSave={(next) => save({ industry: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Target audience" icon={<Users size={14} />}><EditableTextField value={identity.audienceSummary} placeholder="Who should this brand reach?" multiline onSave={(next) => save({ targetAudience: normaliseClearedText(next), audienceDetails: { summary: normaliseClearedText(next) } })} /></BrandField>
            <BrandField label="Positioning" icon={<Target size={14} />}><EditableTextField value={identity.valueProposition} placeholder="Why this brand wins" multiline onSave={(next) => save({ positioning: { valueProposition: normaliseClearedText(next) } })} /></BrandField>
            <BrandField label="Logo URL"><EditableTextField value={identity.logoUrl} placeholder="https://example.com/logo.svg" onSave={(next) => saveVisualIdentity({ logoUrl: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Primary color" icon={<Palette size={14} />}><EditablePrimaryColor value={identity.primaryColor} onSave={savePrimaryColor} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Brand Essentials" hint="The core identity and positioning context.">
          <div className="brand-fields">
            <BrandField label="Positioning" icon={<Target size={14} />}><EditableTextField value={identity.valueProposition} placeholder="Why this brand wins" multiline onSave={(next) => save({ positioning: { valueProposition: normaliseClearedText(next) } })} /></BrandField>
            <BrandField label="Differentiators"><EditableTags label="Differentiators" values={ai?.differentiators ?? []} placeholder="Add a differentiator" onSave={(next) => saveAiProfile({ differentiators: next })} /></BrandField>
            <BrandField label="Business model"><EditableTextField value={ai?.businessModel ?? null} placeholder="How the business makes money or delivers value" onSave={(next) => saveAiProfile({ businessModel: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Primary market"><EditableTextField value={ai?.primaryMarket ?? null} placeholder="Primary market" onSave={(next) => saveAiProfile({ primaryMarket: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Geography"><EditableTextField value={ai?.geography ?? null} placeholder="Geography" onSave={(next) => saveAiProfile({ geography: normaliseClearedText(next) })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Products & Services" hint="The products, services and offers the site actually describes.">
          <div className="brand-fields">
            <BrandField label="Products"><EditableTags label="Products" values={ai?.products ?? []} placeholder="Add a product" onSave={(next) => saveAiProfile({ products: next })} /></BrandField>
            <BrandField label="Services"><EditableTags label="Services" values={ai?.services ?? []} placeholder="Add a service" onSave={(next) => saveAiProfile({ services: next })} /></BrandField>
            <BrandField label="Categories"><EditableTags label="Categories" values={ai?.productCategories ?? []} placeholder="Add a category" onSave={(next) => saveAiProfile({ productCategories: next })} /></BrandField>
            <BrandField label="Calls to action"><EditableTags label="Calls to action" values={ai?.callsToAction ?? []} placeholder="Add a CTA" onSave={(next) => saveAiProfile({ callsToAction: next })} /></BrandField>
            <BrandField label="Use cases"><EditableTags label="Use cases" values={ai?.useCases ?? []} placeholder="Add a use case" onSave={(next) => saveAiProfile({ useCases: next })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Colors" hint="Actual declared palette, including external stylesheets, theme metadata and inline styles.">
          <div className="brand-fields">
            <BrandField label="Brand palette" icon={<Palette size={14} />}><EditableColorPalette palette={identity.palette.map((c) => ({ hex: c.hex, role: c.role }))} onSave={savePalette} /></BrandField>
            <BrandField label="Fonts" icon={<Type size={14} />}>
              <div>
                {identity.fonts.length ? <div className="brand-tags">{identity.fonts.map((font) => <span key={font.family} className="brand-tag">{font.family}<span className="brand-swatch-role">{font.source}</span></span>)}</div> : <NotDetected label="No font declarations found on this website" />}
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div><span className="brand-persona-fact-label">Heading font</span><EditableTextField value={identity.headingFont} placeholder="e.g. Inter" onSave={(next) => saveVisualIdentity({ headingFont: normaliseClearedText(next) })} /></div>
                  <div><span className="brand-persona-fact-label">Body font</span><EditableTextField value={identity.bodyFont} placeholder="e.g. Inter" onSave={(next) => saveVisualIdentity({ bodyFont: normaliseClearedText(next) })} /></div>
                </div>
              </div>
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Voice & Tone" hint="The verbal identity extracted from the site's own copy, then made editable.">
          <div className="brand-fields">
            <BrandField label="Tone" icon={<Megaphone size={14} />}><EditableTags label="Tone" values={identity.voice.tone.length ? identity.voice.tone : (ai?.tone ?? [])} placeholder="Add a tone" max={3} primaryFirst suggestions={[...TONE_OPTIONS]} onSave={(next) => saveVoice({ ...identity.voice, tone: next })} /></BrandField>
            <BrandField label="Personality" icon={<Sparkles size={14} />}><EditableTags label="Personality" values={identity.voice.personality} placeholder="Add a descriptive word" suggestions={['Confident', 'Technical', 'Empowering', 'Friendly', 'Warm', 'Bold']} onSave={(next) => saveVoice({ ...identity.voice, personality: next })} /></BrandField>
            <BrandField label="Style Notes" icon={<Quote size={14} />}><EditableTextField value={identity.voice.styleNotes} placeholder="e.g. Use short sentences. Address the reader directly." multiline emptyLabel="No style notes yet" onSave={(next) => saveVoice({ ...identity.voice, styleNotes: normaliseClearedText(next) })} /></BrandField>
            <BrandField label="Common wording" icon={<Quote size={14} />}><EditableTags label="Common wording" values={ai?.terminology ?? identity.terminology} placeholder="Add preferred terminology" onSave={(next) => saveAiProfile({ terminology: next })} /></BrandField>
            <BrandField label="Recurring claims"><EditableTags label="Recurring claims" values={ai?.recurringClaims ?? []} placeholder="Add a recurring claim" onSave={(next) => saveAiProfile({ recurringClaims: next })} /></BrandField>
            <BrandField label="Messaging themes"><EditableTags label="Messaging themes" values={ai?.messagingThemes ?? []} placeholder="Add a messaging theme" onSave={(next) => saveAiProfile({ messagingThemes: next })} /></BrandField>
          </div>
          {voiceSummary || axisRows.length ? <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>{voiceSummary ? <div className="brand-voice-summary">Your brand voice is: {voiceSummary}</div> : null}{axisRows.length ? <div className="brand-voice-axes">{axisRows.map((axis) => { const value = axes[axis.key] ?? 0; return <div key={axis.key} className="brand-axis"><span>{axis.left}</span><div className="brand-axis-track" role="img" aria-label={`${axis.left} to ${axis.right}: ${Math.round(value * 100)} percent toward ${axis.right}`}><span className="brand-axis-fill" style={{ width: `${value * 100}%` }} /><span className="brand-axis-knob" style={{ left: `${value * 100}%` }} /></div><span className="brand-axis-end">{axis.right}</span></div>; })}</div> : null}</div> : null}
        </BrandSection>

        <BrandSection title="Audience" hint="Target audience, segments, needs and use cases.">
          <div className="brand-fields">
            <BrandField label="Customer types"><EditableTags label="Customer types" values={ai?.customerTypes ?? []} placeholder="Add a customer type" onSave={(next) => saveAiProfile({ customerTypes: next })} /></BrandField>
            <BrandField label="Personas" icon={<Users size={14} />}><EditablePersonas personas={ai?.personas ?? []} onSave={(next) => saveAiProfile({ personas: next })} /></BrandField>
            <BrandField label="Pain points"><EditableTags label="Pain points" values={ai?.painPoints ?? []} placeholder="Add a pain point" onSave={(next) => saveAiProfile({ painPoints: next })} /></BrandField>
            <BrandField label="Use cases"><EditableTags label="Use cases" values={ai?.useCases ?? []} placeholder="Add a use case" onSave={(next) => saveAiProfile({ useCases: next })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Custom Brand Rules" hint="Optional human-authored constraints. Add as many as your team needs; these are passed into strategy and content generation as authoritative guidance.">
          <EditableBrandRules
            rules={identity.brandRules}
            onSave={(next) => save({ brandRules: { customRules: next } })}
          />
        </BrandSection>

        <BrandSection title="Working signals" hint="Website-derived language can be refined here before it becomes active working context.">
          <div className="brand-fields">
            <BrandField label="Positioning themes"><EditableTags label="Positioning themes" values={ai?.positioningThemes ?? []} placeholder="Add a positioning theme" onSave={(next) => saveAiProfile({ positioningThemes: next })} /></BrandField>
            <BrandField label="Calls to action"><EditableTags label="Calls to action" values={ai?.callsToAction ?? []} placeholder="Add a CTA" onSave={(next) => saveAiProfile({ callsToAction: next })} /></BrandField>
          </div>
        </BrandSection>

        <BrandSection title="Assets" hint="Public visual assets discovered from the website.">
          {identity.assets.length ? <div className="brand-persona-grid">{identity.assets.map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="brand-persona" style={{ textDecoration: 'none' }}><div style={{ height: 110, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 10, background: 'var(--surface-muted)' }}><img src={asset.url} alt={asset.label ?? ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div><span className="brand-persona-desc" style={{ display: 'block', marginTop: 7, overflowWrap: 'anywhere' }}>{asset.label || 'Website asset'}</span></a>)}</div> : <NotDetected label="No public image assets detected" />}
        </BrandSection>

        <BrandSection title="Social & Brand Links" hint="Public profile links discovered on the site.">
          {identity.socialProfiles.length ? <div className="brand-tags">{identity.socialProfiles.map((profile) => <a key={profile.platform} href={profile.url} target="_blank" rel="noreferrer" className="brand-tag" style={{ textDecoration: 'none' }}>{profile.platform}</a>)}</div> : <NotDetected label="No social profiles detected" />}
        </BrandSection>

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
      <aside className="brand-profile-preview-column" aria-label="Live brand preview">
        <BrandPanel icon={<Sparkles size={17} />} title="Live preview" subtitle="See the active brand identity before it reaches strategy, campaigns and content.">
          <BrandLivePreview identity={identity} websiteUrl={websiteUrl} ai={ai} />
          <p className="brand-section-hint" style={{ margin: 0 }}>
            Edit any field on the left and save it. The saved value becomes the active brand context.
          </p>
        </BrandPanel>
      </aside>
    </div>
  );
}
