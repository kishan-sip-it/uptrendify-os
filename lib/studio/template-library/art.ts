import type { TemplatePalette } from './types';

/**
 * Original in-repo vector art for Studio templates. Every path is authored
 * here (no third-party assets, no network). Stroke icons live on a 24×24 grid
 * (rendered stroke-only); decorations are filled silhouettes on their own
 * viewBox. Rendered through the native svgPath shape layer, so each piece is
 * an independently editable vector element after apply.
 */

export type TemplateArt = { d: string; w: number; h: number; stroke?: boolean };

const icon = (d: string): TemplateArt => ({ d, w: 24, h: 24, stroke: true });

export const TEMPLATE_ART: Record<string, TemplateArt> = {
  // ---- stroke icons (24×24) -------------------------------------------------
  check: icon('M4 12.5l5.2 5.2L20 6.8'),
  'arrow-right': icon('M4 12h15M13 5.5L19.5 12 13 18.5'),
  'arrow-up-right': icon('M6 18L18 6M8.5 6H18v9.5'),
  bolt: icon('M13 2.5L4.5 13.5H11L9.8 21.5 19 10.5h-6.5z'),
  heart: icon('M12 20.5S3.5 15 3.5 8.9C3.5 6 5.8 4 8.3 4c1.6 0 3 .9 3.7 2.1C12.7 4.9 14.1 4 15.7 4c2.5 0 4.8 2 4.8 4.9C20.5 15 12 20.5 12 20.5z'),
  star: icon('M12 3.2l2.7 5.7 6.1.8-4.5 4.3 1.2 6.1L12 17.2l-5.5 2.9 1.2-6.1L3.2 9.7l6.1-.8z'),
  spark: icon('M12 2.5c.6 4.8 2.7 6.9 7.5 7.5-4.8.6-6.9 2.7-7.5 7.5-.6-4.8-2.7-6.9-7.5-7.5 4.8-.6 6.9-2.7 7.5-7.5zM19 15.5c.3 2.4 1.3 3.4 3.7 3.7-2.4.3-3.4 1.3-3.7 3.7-.3-2.4-1.3-3.4-3.7-3.7 2.4-.3 3.4-1.3 3.7-3.7z'),
  cart: icon('M3 4h2.4l2.5 12.2h10.6L21 8H6.2M9.5 20.8a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM17.6 20.8a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z'),
  bag: icon('M5.5 8h13l-1 12.5h-11zM8.6 10.5V6.9a3.4 3.4 0 016.8 0v3.6'),
  play: icon('M7.5 4.5v15L19.5 12z'),
  mail: icon('M3 6h18v12H3zM3 7l9 6.5L21 7'),
  phone: icon('M5 3.5h4l1.6 4.6-2.3 1.8a13 13 0 006.3 6.3l1.8-2.3 4.6 1.6v4A2 2 0 0119 21.4 16.4 16.4 0 013 5.5a2 2 0 012-2z'),
  pin: icon('M12 21.5S5 14.6 5 9.8A7 7 0 0119 9.8c0 4.8-7 11.7-7 11.7zM12 12a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z'),
  globe: icon('M12 21.5a9.5 9.5 0 100-19 9.5 9.5 0 000 19zM2.7 9.5h18.6M2.7 14.5h18.6M12 2.5c-4.7 4.7-4.7 14.3 0 19 4.7-4.7 4.7-14.3 0-19z'),
  calendar: icon('M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4'),
  clock: icon('M12 21a9 9 0 100-18 9 9 0 000 18zM12 6.5V12l3.8 2.4'),
  'chart-bar': icon('M4 20.5h16M6.5 20V13M11 20V6.5M15.5 20V10M20 20V4'),
  'chart-line': icon('M3.5 20.5v-17M3.5 20.5h17M6.5 15.5l4.4-5.4 3.3 3 4.8-6'),
  'trending-up': icon('M3 17.5l6-6.5 4 3.6L20.5 6M15.5 6h5v5'),
  users: icon('M9 11.2a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zM2.8 20.5c.6-3.7 3.1-5.6 6.2-5.6s5.6 1.9 6.2 5.6M15.5 4.4a3.6 3.6 0 010 6.9M17.6 15.3c2 .7 3.3 2.4 3.7 5.2'),
  chat: icon('M3.5 4.5h17v11.5h-9.5L6 20.4V16H3.5z'),
  camera: icon('M3.5 7.5h4l1.7-2.5h5.6L16.5 7.5h4v12h-17zM12 16.8a3.4 3.4 0 100-6.8 3.4 3.4 0 000 6.8z'),
  tag: icon('M3.5 3.5h8L20.8 12a1.7 1.7 0 010 2.4l-6.4 6.4a1.7 1.7 0 01-2.4 0L3.5 12.5v-9zM8.2 8.2h.01'),
  gift: icon('M3.5 8.5h17v4h-17zM5 12.5h14v8.5H5zM12 8.5v12.5M12 8.5C9 8.5 7.2 7 7.6 5.2 8 3.6 10.4 3.4 12 8.5zM12 8.5c3 0 4.8-1.5 4.4-3.3C16 3.6 13.6 3.4 12 8.5z'),
  coffee: icon('M4.5 8.5h12v7a5 5 0 01-5 5h-2a5 5 0 01-5-5zM16.5 9.5h1.8a2.6 2.6 0 010 5.2h-1.8M7.8 2.5c-.6 1.2-.6 2 0 3.2M11.8 2.5c-.6 1.2-.6 2 0 3.2'),
  leaf: icon('M5 19C5 9 11 4 20.5 3.5 20 13.5 15 19.5 5.8 19zM5 19c2.8-5.5 6.5-9 11-11'),
  sun: icon('M12 16.8a4.8 4.8 0 100-9.6 4.8 4.8 0 000 9.6zM12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7'),
  shield: icon('M12 2.8l7.5 3v6.2c0 4.6-3.2 7.9-7.5 9.7-4.3-1.8-7.5-5.1-7.5-9.7V5.8zM8.8 12l2.3 2.3 4.1-4.6'),
  book: icon('M4 4.5h6.5a2.5 2.5 0 012.5 2.5v13a2.5 2.5 0 00-2.5-2.5H4zM20 4.5h-6.5A2.5 2.5 0 0011 7v13a2.5 2.5 0 012.5-2.5H20z'),
  pen: icon('M4 20l1.2-4.2L16.4 4.6a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.2 18.8zM14.5 6.5l3 3'),
  mic: icon('M12 14.8a3.4 3.4 0 003.4-3.4V6a3.4 3.4 0 10-6.8 0v5.4a3.4 3.4 0 003.4 3.4zM5.8 11.5a6.2 6.2 0 0012.4 0M12 17.8V21M8.8 21h6.4'),
  video: icon('M3.5 6.5h12v11h-12zM15.5 10.5l5-3v9l-5-3'),
  target: icon('M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 13.2a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z'),
  layers: icon('M12 3.5L21 8.5l-9 5-9-5zM4.5 12.5L12 16.7l7.5-4.2M4.5 16.5L12 20.7l7.5-4.2'),
  search: icon('M10.8 17.6a6.8 6.8 0 100-13.6 6.8 6.8 0 000 13.6zM15.8 15.8L21 21'),
  bell: icon('M6 16.5v-6a6 6 0 1112 0v6l1.8 2.7H4.2zM9.8 19.2a2.3 2.3 0 004.4 0'),
  download: icon('M12 3.5v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15'),
  link: icon('M9.5 14.5l5-5M8 11L5.6 13.4a3.8 3.8 0 005.4 5.4L13.4 16.4M16 13l2.4-2.4a3.8 3.8 0 00-5.4-5.4L10.6 7.6'),
  quote: icon('M5 13.5c0-4 2-7 5.5-8.5l.8 1.6C9 8 8.2 9.5 8.1 11c.3-.1.7-.2 1.1-.2a2.7 2.7 0 010 5.4c-2.4 0-4.2-1.1-4.2-2.7zM13 13.5c0-4 2-7 5.5-8.5l.8 1.6C17 8 16.2 9.5 16.1 11c.3-.1.7-.2 1.1-.2a2.7 2.7 0 010 5.4c-2.4 0-4.2-1.1-4.2-2.7z'),

  // ---- filled decorations ----------------------------------------------------
  wave: { d: 'M0 60 C 120 10, 240 110, 360 60 C 420 35, 480 40, 520 55 L 520 90 L 0 90 Z', w: 520, h: 90 },
  'wave-line': { d: 'M0 30 C 90 -10, 180 70, 270 30 C 360 -10, 450 70, 540 30', w: 540, h: 60, stroke: true },
  blob: { d: 'M158 12c52-14 116 4 138 48 22 45-4 106-45 133-41 28-102 27-143-3S47 105 65 62C83 20 106 26 158 12z', w: 310, h: 208 },
  'blob-soft': { d: 'M256 34c46 32 60 106 32 152S178 262 122 240 18 156 34 102 106 24 156 18 210 2 256 34z', w: 300, h: 264 },
  ring: { d: 'M110 20a90 90 0 110 180 90 90 0 010-180zm0 34a56 56 0 100 112 56 56 0 000-112z', w: 220, h: 220 },
  'quarter-arc': { d: 'M0 220L0 0A220 220 0 01220 220L0 220z', w: 220, h: 220 },
  'half-disc': { d: 'M10 130a120 120 0 01240 0z', w: 260, h: 140 },
  seal: { d: 'M110 4l20 26 32-10 8 33 33 8-10 32 26 20-26 20 10 32-33 8-8 33-32-10-20 26-20-26-32 10-8-33-33-8 10-32-26-20 26-20-10-32 33-8 8-33 32 10z', w: 220, h: 232 },
  ribbon: { d: 'M10 40h280v46l-46.7-11.5L196.7 86 150 74.5 103.3 86 56.7 74.5 10 86z', w: 300, h: 96 },
  'corner-frame': { d: 'M0 0h120v16H16v104H0zM0 0v120h16V16h104V0z', w: 120, h: 120 },
  dots: { d: 'M8 8h8v8H8zM40 8h8v8h-8zM72 8h8v8h-8zM104 8h8v8h-8zM8 40h8v8H8zM40 40h8v8h-8zM72 40h8v8h-8zM104 40h8v8h-8zM8 72h8v8H8zM40 72h8v8h-8zM72 72h8v8h-8zM104 72h8v8h-8zM8 104h8v8H8zM40 104h8v8h-8zM72 104h8v8h-8zM104 104h8v8h-8z', w: 120, h: 120 },
  stripes: { d: 'M0 120L120 0h34L34 120zM52 120L172 0h34L86 120zM104 120L224 0h34L138 120z', w: 258, h: 120 },
  'underline-brush': { d: 'M4 22C60 6 180 6 236 18c4 4 4 10-2 12C170 40 60 40 8 32c-5-2-6-8-4-10z', w: 240, h: 40 },
  'badge-flag': { d: 'M12 0h196l-24 34 24 34H12z', w: 220, h: 68 },
  triangle: { d: 'M90 10L170 150H10z', w: 180, h: 160 },
  cross: { d: 'M70 10h40v60h60v40h-60v60H70v-60H10V70h60z', w: 180, h: 180 },
  'arrow-swoosh': { d: 'M6 66C90 6 210 6 294 40l-16 26C210 40 110 44 30 92z M294 40l-44-18 10 44z', w: 300, h: 100 },
  'chart-columns': { d: 'M10 150V90h40v60zM70 150V50h40v100zM130 150V20h40v130zM190 150v-70h40v70z', w: 240, h: 160 },
  'pie-chart': { d: 'M100 10a90 90 0 11-63.6 153.6L100 100zM92 8a90 90 0 00-84 84h84z', w: 200, h: 200 },
  boltfill: { d: 'M128 4L36 132h58l-14 104 96-132h-60z', w: 200, h: 240 },
  heartfill: { d: 'M110 200S10 138 10 71C10 40 34 18 62 18c19 0 37 10 48 26 11-16 29-26 48-26 28 0 52 22 52 53 0 67-100 129-100 129z', w: 220, h: 210 },
  starburst: { d: 'M110 2l14 44 40-22-12 46 46 4-36 30 36 30-46 4 12 46-40-22-14 44-14-44-40 22 12-46-46-4 36-30-36-30 46-4-12-46 40 22z', w: 220, h: 226 },
};

export function templateArtById(id: string): TemplateArt | null {
  return TEMPLATE_ART[id] ?? null;
}

/**
 * Curated palettes. `bg` is the page background, `ink` the primary text colour,
 * `accent` the brand pop, `soft` a tint for panels/badges, `paper` a
 * near-white for cards sitting on the bg.
 */
export const TEMPLATE_PALETTES: Record<string, TemplatePalette> = {
  ivory: { name: 'Ivory ink', bg: '#faf7f2', ink: '#1f2937', accent: '#b4552d', accentText: '#b4552d', onAccent: '#ffffff', soft: '#efe7db', paper: '#ffffff' },
  paperblue: { name: 'Paper blue', bg: '#f6f8fc', ink: '#16243d', accent: '#2563eb', accentText: '#2563eb', onAccent: '#ffffff', soft: '#e3ebfa', paper: '#ffffff' },
  mint: { name: 'Mint deep', bg: '#f2fbf7', ink: '#0d3b2e', accent: '#0ea371', accentText: '#0a7a55', onAccent: '#111111', soft: '#d9f2e6', paper: '#ffffff' },
  cream: { name: 'Cream noir', bg: '#f8f4ec', ink: '#191714', accent: '#c9a227', accentText: '#836919', onAccent: '#191714', soft: '#eae0cd', paper: '#ffffff' },
  blush: { name: 'Blush warm', bg: '#fdf3f1', ink: '#3d1f1c', accent: '#e2725b', accentText: '#aa5644', onAccent: '#3d1f1c', soft: '#f6ddd6', paper: '#ffffff' },
  lilac: { name: 'Lilac field', bg: '#f7f5fd', ink: '#241b3a', accent: '#7c5cff', accentText: '#694ed9', onAccent: '#000000', soft: '#e6dff9', paper: '#ffffff' },
  amber: { name: 'Slate amber', bg: '#f4f6f8', ink: '#1c2733', accent: '#d97706', accentText: '#a35904', onAccent: '#1c2733', soft: '#e2e8f0', paper: '#ffffff' },
  forest: { name: 'Forest calm', bg: '#f4f7f2', ink: '#14291b', accent: '#2f7d4f', accentText: '#2f7d4f', onAccent: '#ffffff', soft: '#dfeadf', paper: '#ffffff' },
  ocean: { name: 'Ocean desk', bg: '#f3f8fb', ink: '#0b2e3d', accent: '#0e7490', accentText: '#0e7490', onAccent: '#ffffff', soft: '#d9ecf4', paper: '#ffffff' },
  coral: { name: 'Coral pop', bg: '#fff5f2', ink: '#2b1210', accent: '#ff5a3c', accentText: '#bf442d', onAccent: '#2b1210', soft: '#ffe0d6', paper: '#ffffff' },
  mono: { name: 'Mono', bg: '#ffffff', ink: '#111111', accent: '#111111', accentText: '#111111', onAccent: '#ffffff', soft: '#ececec', paper: '#ffffff' },
  noirgold: { name: 'Noir gold', bg: '#14110c', ink: '#f5efe2', accent: '#d4af37', accentText: '#d4af37', onAccent: '#111111', soft: '#2a251c', paper: '#1d1913' },
  midnight: { name: 'Midnight', bg: '#0f172a', ink: '#e2e8f0', accent: '#38bdf8', accentText: '#38bdf8', onAccent: '#111111', soft: '#1e293b', paper: '#16213a' },
  plum: { name: 'Plum soft', bg: '#fdf7fb', ink: '#35102c', accent: '#b83b8a', accentText: '#b83b8a', onAccent: '#ffffff', soft: '#f4dcea', paper: '#ffffff' },
  teallime: { name: 'Teal fresh', bg: '#f6faf5', ink: '#12332c', accent: '#14b8a6', accentText: '#0d786c', onAccent: '#12332c', soft: '#dcefe9', paper: '#ffffff' },
  sunset: { name: 'Sunset', bg: '#fff8ef', ink: '#3a1f0b', accent: '#f97316', accentText: '#a24b0e', onAccent: '#3a1f0b', soft: '#ffe6c7', paper: '#ffffff' },
  royal: { name: 'Royal', bg: '#f6f6ff', ink: '#131239', accent: '#4f46e5', accentText: '#4f46e5', onAccent: '#ffffff', soft: '#e0e0fa', paper: '#ffffff' },
  sand: { name: 'Sand', bg: '#faf6ef', ink: '#2f2a22', accent: '#8a6d3b', accentText: '#8a6d3b', onAccent: '#ffffff', soft: '#ece2d0', paper: '#ffffff' },
  berry: { name: 'Berry', bg: '#fdf2f6', ink: '#3b0a21', accent: '#be1852', accentText: '#be1852', onAccent: '#ffffff', soft: '#f8d7e3', paper: '#ffffff' },
  steel: { name: 'Steel', bg: '#f5f7fa', ink: '#0f2137', accent: '#475569', accentText: '#475569', onAccent: '#ffffff', soft: '#e2e8f0', paper: '#ffffff' },
  neon: { name: 'Neon night', bg: '#0c0f14', ink: '#e6edf3', accent: '#a3e635', accentText: '#a3e635', onAccent: '#111111', soft: '#1b2129', paper: '#141a22' },
  espresso: { name: 'Espresso', bg: '#f7f3ee', ink: '#241a12', accent: '#7c4a21', accentText: '#7c4a21', onAccent: '#ffffff', soft: '#ebdfd2', paper: '#ffffff' },
  arctic: { name: 'Arctic', bg: '#f4f9fc', ink: '#102a3c', accent: '#0ea5e9', accentText: '#096b97', onAccent: '#102a3c', soft: '#dceef8', paper: '#ffffff' },
  wine: { name: 'Wine', bg: '#faf4f4', ink: '#2d0a12', accent: '#9f1239', accentText: '#9f1239', onAccent: '#ffffff', soft: '#f0dbdd', paper: '#ffffff' },
};

export function templatePaletteByName(name: string): TemplatePalette {
  const palette = TEMPLATE_PALETTES[name];
  if (!palette) throw new Error(`Unknown template palette: ${name}`);
  return palette;
}
