import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CAN_GENERATE_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { createDefaultRegistry, runWithProviderFailover } from '@/lib/ai/registry';
import { AiProviderError } from '@/lib/ai/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import { buildTextAssistPrompt, textAssistInputSchema } from '@/lib/content/text-assist';
import { obs } from '@/lib/obs/logger';

export const runtime = 'nodejs';
export const maxDuration = 45;

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const routeParams = paramsSchema.parse(await params);
    const input = textAssistInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: 'Provide a valid text-assist action and source text.' }, { status: 400 });

    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const supabase = await createSupabaseServerClient();
    const itemResult = await supabase.from('content_items').select('id,status')
      .eq('id', routeParams.contentId)
      .eq('brand_id', routeParams.brandId)
      .eq('organization_id', auth.context.organizationId)
      .maybeSingle();
    if (itemResult.error) throw itemResult.error;
    if (!itemResult.data) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!EDITABLE_BODY_STATUSES.includes(itemResult.data.status)) {
      return NextResponse.json({ error: 'This content is not in an editable status.' }, { status: 409 });
    }
    if (request.signal.aborted) return NextResponse.json({ error: 'Text assist was cancelled.' }, { status: 408 });

    const providers = createDefaultRegistry().configuredInOrder();
    if (!providers.length) {
      return NextResponse.json({ error: 'No AI provider is configured. Configure Groq, OpenAI, or Anthropic to use text assist.' }, { status: 503 });
    }
    const prompt = buildTextAssistPrompt(input.data);
    const completed = await runWithProviderFailover(
      providers,
      (provider) => provider.generate({
        system: prompt.system,
        prompt: prompt.prompt,
        temperature: 0.35,
        maxTokens: 2200,
        fastFail: true,
        signal: request.signal,
      }),
      undefined,
      request.signal,
    );
    const text = completed.result.text.trim().replace(/^\uFEFF/, '');
    if (!text || text.length > 12_000) {
      return NextResponse.json({ error: 'The AI provider returned an empty or oversized result. Try a shorter text selection.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, text, provider: completed.provider.id, model: completed.result.model });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid text-assist request.' }, { status: 400 });
    const status = error instanceof AiProviderError && error.status === 429 ? 503
      : error instanceof AiProviderError && error.status >= 400 && error.status < 500 ? error.status
      : error instanceof Error && /aborted|time budget/i.test(error.message) ? 408 : 502;
    obs.error('Studio text assist failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: status === 503 ? 'AI providers are unavailable or rate limited. Retry shortly.' : 'Could not complete text assist with the configured AI providers.' }, { status });
  }
}
