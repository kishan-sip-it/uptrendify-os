import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { CAN_GENERATE_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AiProviderError } from '@/lib/ai/types';
import { postJson } from '@/lib/ai/http';
import { obs } from '@/lib/obs/logger';
import { magicLayerPlanSchema, validateMagicLayerPlan } from '@/lib/studio/magic-layers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });
const MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const inputSchema = z.object({
  mimeType: z.enum(MIME_TYPES),
  data: z.string().min(16).max(2_800_000),
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

// The plan prompt deliberately reuses the proven raster-text conventions
// (0..1000 normalized bounds, fontSize in 1000-height units, verbatim text,
// per-element confidence) and extends them to shapes, image regions and a
// whole-image background classification with explicit painting order.
const PROMPT = `Analyze this flattened design image and reconstruct its EDITABLE LAYER STRUCTURE. Do not redesign, improve, or invent anything. Return JSON exactly matching:
{
  "background": {"kind":"solid|gradient|photo|unknown","color":"#RRGGBB or null","gradient":{"from":"#RRGGBB","to":"#RRGGBB","angle":145} or null},
  "elements": [
    {"kind":"text","text":"verbatim visible text for one styled line/run","bounds":{"x":0,"y":0,"w":100,"h":40},"fontSize":40,"fontFamily":"Arial","fontWeight":"normal","italic":false,"underline":false,"color":"#111111","align":"left","backgroundKind":"solid","confidence":0.9},
    {"kind":"shape","shape":"rectangle|square|circle|triangle|star|pyramid","bounds":{"x":0,"y":0,"w":120,"h":80},"fill":"#RRGGBB","rotation":0,"confidence":0.8},
    {"kind":"image","bounds":{"x":0,"y":0,"w":300,"h":300},"description":"short alt text for the photo/logo/illustration region","confidence":0.7}
  ],
  "notes": ["short limitation note"]
}
Rules:
- elements are listed in PAINTING ORDER: first element = bottom-most layer, last = top-most.
- Coordinates x/y/w/h are normalized to 0..1000 across the FULL image; x/y is the top-left. fontSize is in 0..1000 units of image height (40 means 4% of image height).
- Detect each visually distinct text line/run as its own element with exact spelling, case and punctuation. Never invent unreadable or ambiguous text.
- Use kind "shape" ONLY for regions that are a single flat colour geometric shape; put its colour in "fill". Use kind "image" for photos, logos, illustrations, gradients-filled graphics or any non-flat region.
- Include ONLY confidently identifiable elements, maximum 24. Do not include the page background itself as an element.
- Element boxes must not overlap by more than half of the smaller box's area; if two candidates overlap that much, keep the more confident one.
- background.kind: "solid" with its dominant colour when the empty canvas area is one flat colour; "gradient" with from/to/angle for a smooth two-colour blend; "photo" or "unknown" otherwise.
- confidence reflects certainty about BOTH the bounds and the content, 0 to 1.
Return JSON only, no markdown.`;

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
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured. Add a Groq API key to enable Magic Layers reconstruction.' }, { status: 503 });
    }

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
                { type: 'text', text: PROMPT },
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
      return NextResponse.json({ error: 'The vision model returned no structured reconstruction. Try a clearer image or a smaller design.' }, { status: 502 });
    }

    let decoded: unknown;
    try { decoded = JSON.parse(rawText); }
    catch { return NextResponse.json({ error: 'The vision model returned invalid structured data. Try again in a moment.' }, { status: 502 }); }
    const parsedPlan = magicLayerPlanSchema.safeParse(decoded);
    if (!parsedPlan.success) {
      obs.warn('Magic Layers returned an invalid plan schema', { issues: parsedPlan.error.issues.length });
      return NextResponse.json({ error: 'The vision model could not produce a safe layer plan for this image. Try a clearer or simpler source design.' }, { status: 502 });
    }

    // Normalize (caps, duplicate/coverage gates) before anything reaches the client.
    const { plan, dropped } = validateMagicLayerPlan(parsedPlan.data);
    return NextResponse.json({ plan, dropped });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid Magic Layers request.' }, { status: 400 });
    if (error instanceof AiProviderError && error.status === 0 && request.signal.aborted) {
      return NextResponse.json({ error: 'Magic Layers analysis was cancelled.' }, { status: 499 });
    }
    const status = error instanceof AiProviderError && error.status >= 400 && error.status < 500 ? error.status : 502;
    obs.error('Magic Layers reconstruction failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not analyze this image with the vision model. Check the configured model/key and try again.' }, { status });
  }
}
