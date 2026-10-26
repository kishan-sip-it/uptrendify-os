/**
 * WCAG 2.x relative-luminance contrast math for template design gates and
 * runtime accent-text resolution. Shared by the builder (picking a readable
 * accent variant) and the audit (enforcing the ratio on every text element).
 */

const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
};

const channel = (value: number): number => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Mix `fg` over `bg` with alpha (0–1) — used for opacity-faded text. */
export function mixOver(fgHex: string, bgHex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const f = hexToRgb(fgHex);
  const b = hexToRgb(bgHex);
  const out = f.map((channelValue, index) => Math.round(channelValue * a + b[index]! * (1 - a)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Midpoint of a two-stop gradient — conservative midpoint for backgrounds. */
export function gradientMidpoint(fromHex: string, toHex: string): string {
  return mixOver(fromHex, toHex, 0.5);
}

/** WCAG large-text thresholds: ≥24px, or ≥18.66px bold. */
export function isLargeText(fontSize: number | undefined, bold: boolean): boolean {
  const size = fontSize ?? 16;
  return size >= 24 || (bold && size >= 18.66);
}

export function requiredRatio(fontSize: number | undefined, bold: boolean): number {
  return isLargeText(fontSize, bold) ? 3 : 4.5;
}
