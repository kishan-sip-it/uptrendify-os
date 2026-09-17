export type ChunkOptions = {
  maxChars?: number;
  overlapChars?: number;
};

const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_OVERLAP_CHARS = 120;
const SENTENCE_END = new Set(['.', '!', '?']);
const TRAILING_CLOSERS = new Set(['"', "'", ')', ']', '»', '”', '’']);

function bestSentenceBoundary(text: string, windowStart: number, windowEnd: number): number {
  const segment = text.slice(windowStart, windowEnd);
  for (let i = segment.length - 1; i >= 0; i -= 1) {
    if (SENTENCE_END.has(segment[i])) {
      let boundary = i + 1;
      while (boundary < segment.length && TRAILING_CLOSERS.has(segment[boundary])) boundary += 1;
      if (boundary < segment.length && segment[boundary] === ' ') boundary += 1;
      return windowStart + boundary;
    }
  }
  return -1;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 2)));
  const body = text.trim();
  if (!body) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < body.length) {
    const end = Math.min(start + maxChars, body.length);
    let cut = end;

    if (end < body.length) {
      const lookbackStart = Math.max(start, end - 240);
      const boundary = bestSentenceBoundary(body, lookbackStart, end);
      if (boundary > lookbackStart) {
        cut = boundary;
      } else {
        const whitespace = body.lastIndexOf(' ', end);
        if (whitespace > lookbackStart) cut = whitespace;
      }
    }

    let chunk = body.slice(start, cut).trim();
    if (!chunk) {
      cut = end;
      chunk = body.slice(start, cut);
    }
    if (chunk) chunks.push(chunk);

    if (cut >= body.length) break;

    let nextStart = cut + 1;
    if (overlapChars > 0 && cut - overlapChars > start) nextStart = cut - overlapChars;
    if (nextStart <= start) nextStart = start + 1;
    start = nextStart;
  }

  return chunks;
}

export function chunkTextBounded(text: string, maxChunks: number, options: ChunkOptions = {}): string[] {
  return chunkText(text, options).slice(0, maxChunks);
}