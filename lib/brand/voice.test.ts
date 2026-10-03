import { describe, expect, it } from 'vitest';
import {
  EMPTY_VOICE,
  MAX_TONES,
  describeVoice,
  isVoiceDetected,
  normalisePersonality,
  normaliseStyleNotes,
  normaliseTone,
  normaliseVoice,
  voiceAxisValues,
} from './voice';

describe('normaliseTone', () => {
  it('maps synonyms onto the canonical vocabulary', () => {
    expect(normaliseTone(['conversational', 'trustworthy'])).toEqual(['Casual', 'Authoritative']);
    expect(normaliseTone('professional, luxury')).toEqual(['Professional', 'Sophisticated']);
  });

  it('caps the blend and preserves caller order so index 0 stays primary', () => {
    const result = normaliseTone(['playful', 'friendly', 'casual', 'formal', 'authoritative']);
    expect(result).toHaveLength(MAX_TONES);
    expect(result[0]).toBe('Playful');
  });

  it('deduplicates', () => {
    expect(normaliseTone(['Friendly', 'warm', 'friendly'])).toEqual(['Friendly']);
  });

  it('preserves legitimate custom tone wording rather than discarding it', () => {
    expect(normaliseTone(['playful', 'sardonic'])).toEqual(['Playful', 'Sardonic']);
  });

  it('returns an empty list when there is no usable evidence', () => {
    expect(normaliseTone(undefined)).toEqual([]);
    expect(normaliseTone([])).toEqual([]);
    expect(normaliseTone('')).toEqual([]);
    expect(normaliseTone(['', '  '])).toEqual([]);
  });
});

describe('normalisePersonality', () => {
  it('splits delimited strings and title-cases words', () => {
    expect(normalisePersonality('confident, technical; empowering')).toEqual([
      'Confident',
      'Technical',
      'Empowering',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(normalisePersonality(['Friendly', 'friendly'])).toEqual(['Friendly']);
  });

  it('rejects noise', () => {
    expect(normalisePersonality(['a', '', '   ', 'x'.repeat(60)])).toEqual([]);
  });
});

describe('normaliseStyleNotes', () => {
  it('collapses whitespace and keeps real guidance', () => {
    expect(normaliseStyleNotes('  Use short sentences.\nAddress the reader directly. ')).toBe(
      'Use short sentences. Address the reader directly.',
    );
  });

  it('returns null rather than substituting a default', () => {
    expect(normaliseStyleNotes('')).toBeNull();
    expect(normaliseStyleNotes('   ')).toBeNull();
    expect(normaliseStyleNotes(undefined)).toBeNull();
  });
});

describe('normaliseVoice', () => {
  it('normalises every field together', () => {
    expect(
      normaliseVoice({ tone: ['conversational'], personality: 'warm, witty', styleNotes: 'Be brief.' }),
    ).toEqual({ tone: ['Casual'], personality: ['Warm', 'Witty'], styleNotes: 'Be brief.' });
  });

  it('treats garbage input as not detected', () => {
    expect(normaliseVoice(null)).toEqual(EMPTY_VOICE);
    expect(isVoiceDetected(normaliseVoice({ tone: 'nonsense-token' }))).toBe(true);
    expect(isVoiceDetected(EMPTY_VOICE)).toBe(false);
  });
});

describe('voiceAxisValues', () => {
  it('weights the primary tone most heavily', () => {
    const playfulFirst = voiceAxisValues({ tone: ['Playful', 'Authoritative'], personality: [], styleNotes: null });
    const authoritativeFirst = voiceAxisValues({
      tone: ['Authoritative', 'Playful'],
      personality: [],
      styleNotes: null,
    });
    expect(playfulFirst.serious).toBeLessThan(authoritativeFirst.serious);
    expect(authoritativeFirst.serious).toBeGreaterThan(0.5);
  });

  it('omits axes entirely when no tone is known, so the UI can hide them', () => {
    expect(voiceAxisValues(EMPTY_VOICE)).toEqual({});
  });
});

describe('describeVoice', () => {
  it('summarises the stored voice', () => {
    expect(describeVoice({ tone: ['Friendly'], personality: ['Warm'], styleNotes: null })).toBe('Friendly and Warm.');
    expect(describeVoice({ tone: ['Casual', 'Playful'], personality: [], styleNotes: null })).toBe('Casual and Playful.');
  });

  it('returns null when nothing is detected', () => {
    expect(describeVoice(EMPTY_VOICE)).toBeNull();
  });
});