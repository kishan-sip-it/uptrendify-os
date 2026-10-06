/**
 * Structured brand voice.
 *
 * The Brand workspace needs a stable shape for voice so that generation,
 * editing and the UI all agree. This module owns:
 *  - the canonical tone vocabulary (first entry is always primary)
 *  - normalisation of anything the extractor or a human produced
 *  - the trait axis used by the voice preview
 *
 * Nothing here invents content: `normaliseTone` maps free text onto the known
 * vocabulary and drops anything unrecognised, and callers are expected to
 * surface an empty result as "not detected" rather than substituting a default.
 */

export const TONE_OPTIONS = [
  'Professional',
  'Casual',
  'Friendly',
  'Authoritative',
  'Playful',
  'Sophisticated',
] as const;

export type ToneOption = (typeof TONE_OPTIONS)[number];

export const MAX_TONES = 3;

export type BrandVoice = {
  /** Up to MAX_TONES entries. Index 0 is the primary tone. */
  tone: string[];
  /** Descriptive words describing the brand. */
  personality: string[];
  /** Free-form writing guidance. */
  styleNotes: string | null;
};

export const EMPTY_VOICE: BrandVoice = { tone: [], personality: [], styleNotes: null };

/** Loose synonyms so extracted wording lands on the canonical vocabulary. */
const TONE_SYNONYMS: Record<string, ToneOption> = {
  professional: 'Professional',
  'business professional': 'Professional',
  corporate: 'Professional',
  formal: 'Professional',
  expert: 'Authoritative',
  authoritative: 'Authoritative',
  trustworthy: 'Authoritative',
  credible: 'Authoritative',
  casual: 'Casual',
  informal: 'Casual',
  conversational: 'Casual',
  relaxed: 'Casual',
  friendly: 'Friendly',
  warm: 'Friendly',
  approachable: 'Friendly',
  welcoming: 'Friendly',
  playful: 'Playful',
  fun: 'Playful',
  humorous: 'Playful',
  witty: 'Playful',
  sophisticated: 'Sophisticated',
  premium: 'Sophisticated',
  elegant: 'Sophisticated',
  refined: 'Sophisticated',
  luxury: 'Sophisticated',
};

function titleCaseWord(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function cleanWord(value: string): string | null {
  const trimmed = value.replace(/^[\s\-–—•·*]+|[\s\-–—•·*,;.]+$/g, '').trim();
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  return titleCaseWord(trimmed.toLowerCase());
}

/**
 * Map arbitrary tone wording onto the canonical vocabulary.
 * Custom wording is preserved (up to MAX_TONES) so a human or the extractor can
 * express a tone the preset list does not cover, but it is never invented here.
 */
export function normaliseTone(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,;/|]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const cleaned = entry.replace(/^[\s\-–—•·*]+|[\s\-–—•·*,;.]+$/g, '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    const canonical = TONE_SYNONYMS[key] ?? cleanWord(cleaned);
    if (!canonical) continue;
    const dedupe = canonical.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    result.push(canonical);
    if (result.length >= MAX_TONES) break;
  }

  return result;
}

export function normalisePersonality(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,;/|]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const word = cleanWord(entry);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(word);
    if (result.length >= 12) break;
  }

  return result;
}

export function normaliseStyleNotes(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 1200);
}

export function normaliseVoice(input: unknown): BrandVoice {
  const source = (input ?? {}) as Partial<BrandVoice>;
  return {
    tone: normaliseTone(source.tone),
    personality: normalisePersonality(source.personality),
    styleNotes: normaliseStyleNotes(source.styleNotes),
  };
}

export function isVoiceDetected(voice: BrandVoice): boolean {
  return voice.tone.length > 0 || voice.personality.length > 0 || Boolean(voice.styleNotes);
}

/**
 * Trait axes for the voice preview. Each axis runs 0..1 from the left label to
 * the right label. Values are derived from the selected tone only, so the
 * preview is a faithful rendering of stored data rather than a separate model.
 */
export const VOICE_AXES = [
  { key: 'serious', left: 'Serious', right: 'Funny' },
  { key: 'casual', left: 'Casual', right: 'Formal' },
  { key: 'irreverent', left: 'Irreverent', right: 'Respectful' },
  { key: 'factual', left: 'Matter of fact', right: 'Enthusiastic' },
] as const;

export type VoiceAxisKey = (typeof VOICE_AXES)[number]['key'];

const TONE_AXIS_WEIGHTS: Record<string, Partial<Record<VoiceAxisKey, number>>> = {
  professional: { serious: 0.62, casual: 0.28, irreverent: 0.2, factual: 0.72 },
  formal: { serious: 0.7, casual: 0.2, irreverent: 0.18, factual: 0.7 },
  authoritative: { serious: 0.72, casual: 0.3, irreverent: 0.22, factual: 0.8 },
  casual: { serious: 0.3, casual: 0.78, irreverent: 0.55, factual: 0.45 },
  friendly: { serious: 0.38, casual: 0.68, irreverent: 0.42, factual: 0.5 },
  playful: { serious: 0.18, casual: 0.8, irreverent: 0.78, factual: 0.3 },
  sophisticated: { serious: 0.68, casual: 0.3, irreverent: 0.28, factual: 0.62 },
};

export function voiceAxisValues(voice: BrandVoice): Record<VoiceAxisKey, number> {
  const totals: Record<string, number[]> = {};
  for (const tone of voice.tone) {
    const weights = TONE_AXIS_WEIGHTS[tone.toLowerCase()];
    if (!weights) continue;
    // Primary tone carries triple weight, matching "first tone is primary".
    const multiplier = tone === voice.tone[0] ? 3 : 1;
    for (const [key, value] of Object.entries(weights)) {
      (totals[key] ??= []).push((value as number) * multiplier);
    }
  }

  const result = {} as Record<VoiceAxisKey, number>;
  for (const axis of VOICE_AXES) {
    const values = totals[axis.key] ?? [];
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    result[axis.key] = Math.min(1, Math.max(0, Math.round(mean * 100) / 100));
  }
  return result;
}

export function describeVoice(voice: BrandVoice): string | null {
  const parts = [...voice.tone, ...voice.personality];
  if (parts.length === 0) return null;
  if (parts.length === 1) return `${parts[0]}.`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}.`;
  return `${parts[0]}, ${parts[1]} and ${parts.slice(2).join(', ')}.`;
}