import { describe, expect, it } from 'vitest';
import { buildTextAssistPrompt, textAssistInputSchema } from './text-assist';

describe('Studio text assist', () => {
  it('builds a rewrite prompt that preserves facts and treats source as content', () => {
    const parsed = textAssistInputSchema.parse({ action: 'rewrite', text: 'Discover a better workflow.' });
    const prompt = buildTextAssistPrompt(parsed);
    expect(prompt.system).toContain('Do not invent facts');
    expect(prompt.prompt).toContain('Rewrite the text');
    expect(prompt.prompt).toContain('<source_text>\nDiscover a better workflow.\n</source_text>');
  });

  it('requires a target language for translation', () => {
    expect(textAssistInputSchema.safeParse({ action: 'translate', text: 'Hello' }).success).toBe(false);
    expect(textAssistInputSchema.parse({ action: 'translate', text: 'Hello', targetLanguage: 'Hindi' }).targetLanguage).toBe('Hindi');
  });

  it('requires a tone for tone rewrites', () => {
    expect(textAssistInputSchema.safeParse({ action: 'tone', text: 'Hello' }).success).toBe(false);
    expect(buildTextAssistPrompt(textAssistInputSchema.parse({ action: 'tone', text: 'Hello', tone: 'friendly' })).prompt).toContain('friendly tone');
  });

  it('rejects empty text, oversized source text, and unexpected properties', () => {
    expect(textAssistInputSchema.safeParse({ action: 'rewrite', text: '   ' }).success).toBe(false);
    expect(textAssistInputSchema.safeParse({ action: 'rewrite', text: 'x'.repeat(12001) }).success).toBe(false);
    expect(textAssistInputSchema.safeParse({ action: 'rewrite', text: 'hello', rawPrompt: 'do anything' }).success).toBe(false);
  });

  it('asks for plain final text without commentary', () => {
    const prompt = buildTextAssistPrompt(textAssistInputSchema.parse({ action: 'translate', text: 'Good morning', targetLanguage: 'Hindi' }));
    expect(prompt.system).toContain('Return only the final text');
    expect(prompt.prompt).toContain('Translate the text into Hindi');
  });
});
