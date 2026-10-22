import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { CAN_GENERATE_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AiProviderError } from '@/lib/ai/types';
import { postJson } from '@/lib/ai/http';
import { obs } from '@/lib/obs/logger';

export const runtime = 'nodejs';

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });
const MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const inputSchema = z.object({
  mimeType: z.enum(MIME_TYPES),
  data: z.string().min(16).max(2_800_000),
});
const recognizedTextSchema = z.object({
  text: z.string().trim().min(1).max(12_000),
  bounds: z.object({
    x: z.number().finite().min(0).max(1000),
    y: z.number().finite().min(0).max(1000),
    w: z.number().finite().min(1).max(1000),
    h: z.number().finite().min(1).max(1000),
  }),
  fontSize: z.number().finite().min(1).max(300),
  fontFamily: z.string().max(120).optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  align: z.enum(['left', 'center', 'right']),
  backgroundKind: z.enum(['solid', 'gradient', 'photo', 'unknown']).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  confidence: z.number().finite().min(0).max(1),
});
const responseSchema = z.object({
  components: z.array(recognizedTextSchema).max(40),
  notes: z.array(z.string().max(240)).max(8).optional(),
});
const MAGIC: Record<(typeof MIME_TYPES)[number], number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

function hasImageSignature(mimeType: (typeof MIME_TYPES)[number], bytes: Buffer): boolean {
  const magic = MAGIC[mimeType];
  if (!magic.every((value, index) => bytes[index] === value)) return false;
  return mimeType !== 'image/webp' ||
    (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50);
}

function isTransientGroqError(error: unknown): boolean {
  return error instanceof AiProviderError &&
    [0, 401, 403, 408, 429, 500, 502, 503, 504, 520, 522, 524, 529].includes(error.status);
}

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const itemResult = await supabase.from('content_items').select('id,status')
      .eq('id', contentId).eq('brand_id', brandId)
      .eq('organization_id', auth.context.organizationId).maybeSingle();
    if (itemResult.error) throw itemResult.error;
    if (!itemResult.data) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!EDITABLE_BODY_STATUSES.includes(itemResult.data.status)) {
      return NextResponse.json({ error: 'This content is not in an editable status.' }, { status: 409 });
    }

    const body = inputSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: 'Provide a valid PNG, JPG, or WEBP image no larger than 2 MB.' }, { status: 400 });
    const bytes = Buffer.from(body.data.data, 'base64');
    if (bytes.byteLength <= 0 || bytes.byteLength > 2 * 1024 * 1024 || !hasImageSignature(body.data.mimeType, bytes)) {
      return NextResponse.json({ error: 'Image data is invalid, unsupported, or larger than 2 MB.' }, { status: 400 });
    }

    const config = env();
    const apiKeys = [...new Set([config.GROQ_API_KEY, config.GROQ_API_KEY_2, config.GROQ_API_KEY_3].filter((key): key is string => Boolean(key)))];
    if (!apiKeys.length) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured. Add a Groq API key to enable AI image recognition.' }, { status: 503 });
    }

    const prompt = `Analyze this flattened design image for editable TEXT ONLY. Do not redesign the image. Return JSON exactly matching:
{
  "components": [{
    "text": "verbatim text for one styled text line/run",
    "bounds": {"x":0,"y":0,"w":100,"h":40},
    "fontSize": 28,
    "fontFamily": "Arial",
    "fontWeight": "normal",
    "italic": false,
    "underline": false,
    "color": "#111111",
    "align": "left",
    "backgroundKind": "solid",
    "backgroundColor": "#eeeeee",
    "confidence": 0.95
  }],
  "notes": ["short limitation note"]
}
Coordinates x/y/w/h are normalized to 0..1000 across the FULL image: x/y are the top-left and w/h are box dimensions. fontSize is normalized to 1000 units of image height (so 40 means 4% of image height). Detect each visually distinct text line/run as a separate component. Preserve exact spelling, letter case, punctuation and line breaks as visible; do not invent unreadable text. Estimate the original font family, weight, italic, underline, text color, alignment and confidence. Estimate backgroundKind at each text region: solid, gradient, photo or unknown. If possible estimate backgroundColor as the dominant local color directly behind that text, in #RRGGBB; otherwise null. This color is used only as a small cover patch underneath that text, never to replace the rest of the image. Return only components with readable text, max 40. Return JSON only, no markdown.`;

    let completion: any = null;
    let lastError: unknown = null;
    for (let index = 0; index < apiKeys.length; index += 1) {
      try {
        completion = await postJson('https://api.groq.com/openai/v1/chat/completions', {
          provider: 'groq-vision',
          headers: { authorization: `Bearer ${apiKeys[index]}` },
          body: {
            model: config.GROQ_VISION_MODEL,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${body.data.mimeType};base64,${bytes.toString('base64')}` } },
              ],
            }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_completion_tokens: 8192,
            stream: false,
          },
          timeoutMs: 45_000,
          signal: request.signal,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!isTransientGroqError(error) || index === apiKeys.length - 1 || request.signal.aborted) throw error;
      }
    }
    if (lastError) throw lastError;

    const rawText = completion?.choices?.[0]?.message?.content;
    if (typeof rawText !== 'string' || !rawText.trim()) {
      return NextResponse.json({ error: 'Groq vision returned no structured recognition result. Try a clearer image or use an SVG source.' }, { status: 502 });
    }

    let decoded: unknown;
    try { decoded = JSON.parse(rawText); }
    catch { return NextResponse.json({ error: 'Groq vision returned invalid structured data. Try again or use an SVG source.' }, { status: 502 }); }
    const parsed = responseSchema.safeParse(decoded);
    if (!parsed.success) {
      obs.warn('Studio raster recognition returned an invalid schema', { issues: parsed.error.issues.length });
      return NextResponse.json({ error: 'Groq vision could not produce safe editable layers for this image. Try SVG or a clearer source.' }, { status: 502 });
    }
    return NextResponse.json({ components: parsed.data.components, notes: parsed.data.notes ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid image recognition request.' }, { status: 400 });
    const status = error instanceof AiProviderError && error.status >= 400 && error.status < 500 ? error.status : 502;
    obs.error('Studio raster image recognition failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not analyze this image with Groq vision. Check the configured Groq model/key and try again.' }, { status });
  }
}
