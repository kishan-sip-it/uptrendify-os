import type { ContentDocBlock } from '@/lib/content/document';

export type BrandLintIssue = {
  blockId: string;
  kind: string;
  message: string;
  patch: Partial<ContentDocBlock>;
};

type BrandKit = { colors: string[] };

function normalizeColor(value: string): string {
  return value.trim().toLowerCase();
}

/** Deterministic brand checks. Content is only changed when the user clicks Fix. */
export function lintBlocks(blocks: readonly ContentDocBlock[], brand: BrandKit, _pageBg?: string | null): BrandLintIssue[] {
  const palette = brand.colors.filter((value) => /^#[0-9a-f]{6}$/i.test(value));
  if (palette.length === 0) return [];
  const allowed = new Set(palette.map(normalizeColor));
  const fallback = palette[0]!;
  const issues: BrandLintIssue[] = [];

  for (const block of blocks) {
    if (block.hidden) continue;
    if ('color' in block && block.color && /^#[0-9a-f]{6}$/i.test(block.color) && !allowed.has(normalizeColor(block.color))) {
      issues.push({
        blockId: block.id,
        kind: 'off-brand-colour',
        message: `This element uses ${block.color}, which is outside the configured brand palette.`,
        patch: { color: fallback },
      });
    }
    if ((block.type === 'heading' || block.type === 'text') && !block.text.trim()) {
      issues.push({
        blockId: block.id,
        kind: 'empty-copy',
        message: 'This text element is empty.',
        patch: { text: block.type === 'heading' ? 'Add a heading' : 'Add your copy' },
      });
    }
  }
  return issues;
}

export function healthScore(issues: readonly BrandLintIssue[], blockCount: number): number {
  if (blockCount <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(100 - (issues.length / blockCount) * 30)));
}

export function channelLimit(channel: string | null | undefined): number | null {
  const key = (channel ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.includes('instagram')) return 2200;
  if (key.includes('linkedin')) return 3000;
  if (key === 'x' || key.includes('twitter')) return 280;
  if (key.includes('tiktok')) return 2200;
  if (key.includes('threads')) return 500;
  if (key.includes('youtube')) return 5000;
  if (key.includes('facebook')) return 63206;
  return null;
}
