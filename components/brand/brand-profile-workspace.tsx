'use client';

import { useCallback, useMemo } from 'react';
import {
  BookOpen,
  Megaphone,
  Palette,
  Quote,
  Sparkles,
  Target,
  Type,
  Users,
} from 'lucide-react';
import {
  BrandField,
  BrandIdentityRow,
  BrandPanel,
  BrandSection,
  NotDetected,
  brandInitials,
} from './brand-profile-primitives';
import {
  EditableColorPalette,
  EditableTags,
  EditableTextField,
  useBrandIdentityEditor,
} from './brand-identity-editors';
import type { BrandIdentity } from '@/lib/brand/identity-mapping';
import { TONE_OPTIONS, VOICE_AXES, describeVoice, voiceAxisValues } from '@/lib/brand/voice';

/**
 * The Brand Profile workspace.
 *
 * Composition mirrors the reference: identity first, then flat working sections
 * built from definition rows. Everything below the identity row is editable in
 * place, and every write goes through the existing brand API so RLS/RBAC stay
 * exactly where they are today.
 */

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

  // Brand palette is injected as scoped custom properties. Every use site mixes
  // it with a semantic token, so a low-contrast brand colour degrades into a
  // tint rather than breaking text contrast in either theme.
  const paletteVars = useMemo(() => {
    const primary = identity.primaryColor ?? identity.palette[0]?.hex ?? null;
    const secondary = identity.palette.find((c) => c.role === 'secondary')?.hex ?? primary;
    return {
      '--brand-primary': primary ?? 'var(--accent)',
      '--brand-secondary': secondary ?? 'var(--accent-2)',
    } as React.CSSProperties;
  }, [identity.primaryColor, identity.palette]);

  const voiceSummary = describeVoice(identity.voice);
  const axes = useMemo(() => voiceAxisValues(identity.voice), [identity.voice]);
  const axisRows = VOICE_AXES.filter((axis) => axes[axis.key] !== undefined);

  /* ---------------- persistence helpers ---------------- */

  const saveVisualIdentity = useCallback(
    (next: Partial<BrandIdentity> & Record<string, unknown>) =>
      save({
        visualIdentity: {
          logoUrl: identity.logoUrl,
          faviconUrl: identity.faviconUrl,
          palette: identity.palette,
          fonts: identity.fonts,
          headingFont: identity.headingFont,
          bodyFont: identity.bodyFont,
          voice: identity.voice,
          socialProfiles: identity.socialProfiles,
          inspected: identity.inspected,
          warnings: identity.warnings,
          detectedAt: identity.detectedAt,
          ...next,
        },
      }),
    [save, identity],
  );

  const saveVoice = useCallback(
    (voice: BrandIdentity['voice']) => saveVisualIdentity({ voice }),
    [saveVisualIdentity],
  );

  const savePalette = useCallback(
    (palette: { hex: string; role: string }[]) => {
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
          inspected: identity.inspected,
          warnings: identity.warnings,
          detectedAt: identity.detectedAt,
        },
      });
    },
    [save, identity],
  );

  /* ---------------- render ---------------- */

  return (
    <div className="brand-profile" style={paletteVars}>
      {/* ============ Identity ============ */}
      <BrandPanel
        icon={<Sparkles size={17} />}
        title="Brand Profile"
        subtitle={
          identity.detectedAt
            ? 'Imported from the brand website. Review anything below — your edits become the authoritative context.'
            : 'Brand identity for this workspace. Values can be added here at any time.'
        }
        actions={
          onRescan ? (
            <button
              type="button"
              className="brand-btn"
              onClick={onRescan}
              disabled={rescanState === 'running' || saving}
            >
              <Sparkles size={13} /> {rescanState === 'running' ? 'Scanning…' : 'Re-scan website'}
            </button>
          ) : null
        }
      >
        <div className="brand-strip" aria-hidden="true" />

        <BrandIdentityRow
          name={identity.name}
          websiteUrl={websiteUrl}
          logoUrl={identity.logoUrl}
          initials={brandInitials(identity.name)}
        />

        {savedAt && !error ? (
          <p className="brand-section-hint" style={{ color: 'var(--status-success)' }}>
            Saved. Your change is now the active brand context.
          </p>
        ) : null}
        {error ? (
          <p className="brand-section-hint" style={{ color: 'var(--status-danger)' }}>
            {error}
          </p>
        ) : null}
      </BrandPanel>

      {/* ============ Essentials + Visual identity + Voice ============ */}
      <BrandPanel
        icon={<BookOpen size={17} />}
        title="Brand Guidelines"
        subtitle="Add overarching brand context and details."
      >
        <BrandSection title="Essentials" hint="The core context every downstream generation reads.">
          <div className="brand-fields">
            <BrandField label="What they do" icon={<BookOpen size={14} />}>
              <EditableTextField
                value={identity.description}
                placeholder="Describe the business in your own words."
                multiline
                onSave={(next) => save({ description: next || null })}
              />
            </BrandField>

            <BrandField label="Industry" icon={<Target size={14} />}>
              <EditableTextField
                value={identity.industry}
                placeholder="e.g. Direct-to-consumer food and beverage"
                onSave={(next) => save({ industry: next || null })}
              />
            </BrandField>

            <BrandField label="Positioning" icon={<Target size={14} />}>
              {identity.valueProposition ? (
                <EditableTextField
                  value={identity.valueProposition}
                  placeholder="Why this brand wins"
                  multiline
                  onSave={(next) =>
                    save({ positioning: { ...(identity as { positioning?: object }).positioning, valueProposition: next } })
                  }
                />
              ) : (
                <NotDetected label="Detected during Brand Brain review" />
              )}
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection
          title="Colors"
          hint="Extracted from the website's own stylesheets, theme metadata and inline styles."
        >
          <div className="brand-fields">
            <BrandField label="Brand Colors" icon={<Palette size={14} />}>
              <EditableColorPalette
                palette={identity.palette.map((c) => ({ hex: c.hex, role: c.role }))}
                onSave={savePalette}
              />
            </BrandField>

            <BrandField label="Fonts" icon={<Type size={14} />}>
              {identity.fonts.length > 0 ? (
                <div>
                  <div className="brand-tags">
                    {identity.fonts.map((font) => (
                      <span key={font.family} className="brand-tag">
                        {font.family}
                        <span className="brand-swatch-role">{font.source}</span>
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div>
                      <span className="brand-persona-fact-label">Heading font</span>
                      <EditableTextField
                        value={identity.headingFont}
                        placeholder="Not detected"
                        onSave={(next) => saveVisualIdentity({ headingFont: next || null })}
                      />
                    </div>
                    <div>
                      <span className="brand-persona-fact-label">Body font</span>
                      <EditableTextField
                        value={identity.bodyFont}
                        placeholder="Not detected"
                        onSave={(next) => saveVisualIdentity({ bodyFont: next || null })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <NotDetected label="No font declarations found on this website" />
              )}
            </BrandField>
          </div>
        </BrandSection>

        <BrandSection
          title="Voice"
          hint="How your brand sounds across every piece of generated content."
        >
          <div className="brand-fields">
            <BrandField label="Tone" icon={<Megaphone size={14} />}>
              <EditableTags
                label="Tone"
                values={identity.voice.tone}
                placeholder="Add a tone"
                max={3}
                primaryFirst
                suggestions={[...TONE_OPTIONS]}
                onSave={(next) => saveVoice({ ...identity.voice, tone: next })}
              />
            </BrandField>

            <BrandField label="Personality" icon={<Sparkles size={14} />}>
              <EditableTags
                label="Personality"
                values={identity.voice.personality}
                placeholder="Add a descriptive word"
                suggestions={['Confident', 'Technical', 'Empowering', 'Friendly', 'Warm', 'Bold']}
                onSave={(next) => saveVoice({ ...identity.voice, personality: next })}
              />
            </BrandField>

            <BrandField label="Style Notes" icon={<Quote size={14} />}>
              <EditableTextField
                value={identity.voice.styleNotes}
                placeholder="e.g. Use short sentences. Address the reader directly."
                multiline
                emptyLabel="No style notes yet"
                onSave={(next) => saveVoice({ ...identity.voice, styleNotes: next || null })}
              />
            </BrandField>

            <BrandField label="Common wording" icon={<Quote size={14} />}>
              {identity.terminology.length > 0 ? (
                <div className="brand-tags">
                  {identity.terminology.map((term) => (
                    <span key={term} className="brand-tag">
                      {term}
                    </span>
                  ))}
                </div>
              ) : (
                <NotDetected label="Detected during Brand Brain review" />
              )}
            </BrandField>
          </div>

          {voiceSummary || axisRows.length > 0 ? (
            <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
              {voiceSummary ? (
                <div className="brand-voice-summary">Your brand voice is: {voiceSummary}</div>
              ) : null}
              {axisRows.length > 0 ? (
                <div className="brand-voice-axes">
                  {axisRows.map((axis) => {
                    const value = axes[axis.key] ?? 0;
                    return (
                      <div key={axis.key} className="brand-axis">
                        <span>{axis.left}</span>
                        <div
                          className="brand-axis-track"
                          role="img"
                          aria-label={`${axis.left} to ${axis.right}: ${Math.round(value * 100)} percent toward ${axis.right}`}
                        >
                          <span className="brand-axis-fill" style={{ width: `${value * 100}%` }} />
                          <span className="brand-axis-knob" style={{ left: `${value * 100}%` }} />
                        </div>
                        <span className="brand-axis-end">{axis.right}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </BrandSection>

        <BrandSection title="Audience" hint="Who this brand is speaking to.">
          <div className="brand-fields">
            <BrandField label="Target audience" icon={<Users size={14} />}>
              <EditableTextField
                value={identity.audienceSummary}
                placeholder="Who should this brand reach?"
                multiline
                onSave={(next) =>
                  save({ audience_details: { ...(identity as { audienceDetails?: object }).audienceDetails, summary: next } })
                }
              />
            </BrandField>

            {identity.personas.length > 0 ? (
              <BrandField label="Segments" icon={<Users size={14} />}>
                <div className="brand-persona-grid">
                  {identity.personas.map((persona) => (
                    <div key={persona.name} className="brand-persona">
                      <h4 className="brand-persona-name">{persona.name}</h4>
                      {persona.description ? <p className="brand-persona-desc">{persona.description}</p> : null}
                    </div>
                  ))}
                </div>
              </BrandField>
            ) : null}
          </div>
        </BrandSection>

        {/* Provenance: honest about what the scan actually looked at. */}
        {identity.inspected.length > 0 || identity.warnings.length > 0 ? (
          <BrandSection title="Import provenance" hint="What the website scan used, so you know how much to trust these values.">
            <div className="brand-fields">
              <BrandField label="Evidence used">
                {identity.inspected.length > 0 ? (
                  <div className="brand-tags">
                    {identity.inspected.map((item) => (
                      <span key={item} className="brand-tag">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <NotDetected label="This brand has not been scanned yet" />
                )}
              </BrandField>
              {identity.warnings.length > 0 ? (
                <BrandField label="Not detected">
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)', fontSize: 12 }}>
                    {identity.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </BrandField>
              ) : null}
            </div>
          </BrandSection>
        ) : null}
      </BrandPanel>
    </div>
  );
}