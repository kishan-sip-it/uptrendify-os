import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_GENERATE_CONTENT, requireOrgRole } from '@/lib/auth/roles';
import { EDITABLE_BODY_STATUSES } from '@/lib/content/edit-policy';
import {
  STUDIO_ASSET_ALLOWED_TYPES,
  STUDIO_ASSET_BUCKET,
  STUDIO_ASSET_MAX_BYTES,
  extensionFor,
  sniffImageType,
  studioAssetStoragePath,
  studioAssetUrl,
} from '@/lib/content/studio-asset-image';
import { assertPublicHttpUrl, fetchPublicHttpFollowingRedirects } from '@/lib/research/url-security';
import { parseVisualIdentity } from '@/lib/brand/identity-mapping';
import { env } from '@/lib/env';
import { obs } from '@/lib/obs/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const paramsSchema = z.object({ brandId: z.string().uuid(), contentId: z.string().uuid() });
const FETCH_TIMEOUT_MS = 15_000;

class LogoTooLargeError extends Error {}
class LogoUnreachableError extends Error {}

async function loadContent(brandId: string, contentId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from('content_items').select('id,status')
    .eq('id', contentId).eq('brand_id', brandId).eq('organization_id', organizationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data as { id: string; status: string } | null;
}

/**
 * Byte-capped body reader for binary images: cancels the stream the moment
 * the limit is exceeded, so an oversized response is never fully buffered.
 */
async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new LogoUnreachableError('The scanned logo source returned an empty body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new LogoTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Import the scanned brand logo as a managed Studio asset.
 *
 * The browser cannot fetch cross-origin scanned logo URLs (CORS), so this
 * narrowly scoped route downloads the logo already stored on the authorized
 * brand's `visual_identity` — read from the database, never accepted from the
 * client — through the shared SSRF-safe public-HTTP fetcher, validates it with
 * the exact same MIME/size/magic-byte contract as the authenticated asset
 * upload route, and stores it in the same private bucket. The response is an
 * ordinary managed asset path that satisfies the content document's
 * `managedStudioAssetPath` schema.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ brandId: string; contentId: string }> }) {
  try {
    const { brandId, contentId } = paramsSchema.parse(await params);
    const auth = await requireOrgRole(CAN_GENERATE_CONTENT);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const organizationId = auth.context.organizationId;
    const item = await loadContent(brandId, contentId, organizationId);
    if (!item) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!EDITABLE_BODY_STATUSES.includes(item.status)) return NextResponse.json({ error: 'This content is not in an editable status. The logo was not imported.' }, { status: 409 });

    const supabase = await createSupabaseServerClient();
    const brandResult = await supabase.from('brands').select('visual_identity')
      .eq('id', brandId).eq('organization_id', organizationId).maybeSingle();
    if (brandResult.error) throw brandResult.error;
    if (!brandResult.data) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    const logoUrl = parseVisualIdentity(brandResult.data.visual_identity).logoUrl?.trim() || null;
    if (!logoUrl) return NextResponse.json({ error: 'No logo is available in this brand scan. Download it, then use Insert → image to place it manually.' }, { status: 400 });

    try {
      assertPublicHttpUrl(logoUrl);
    } catch {
      return NextResponse.json({ error: 'The scanned logo URL is not a public http(s) address. Download it, then use Insert → image to place it manually.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('The scanned logo source timed out.')), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      // SSRF-safe: every redirect hop is re-validated against the public-URL
      // policy and pinned to public DNS addresses before connecting.
      ({ response } = await fetchPublicHttpFollowingRedirects(logoUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'image/png,image/jpeg,image/webp;q=0.9,*/*;q=0.8',
          'user-agent': env().RESEARCH_USER_AGENT,
        },
      }, 3));
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'The scanned logo source timed out. Download it, then use Insert → image to place it manually.' }, { status: 504 });
      }
      const message = fetchError instanceof Error ? fetchError.message : 'The scanned logo source could not be reached.';
      return NextResponse.json({ error: `The brand logo could not be imported from the scanned source: ${message}` }, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return NextResponse.json({ error: `The scanned logo source responded with HTTP ${response.status}.` }, { status: 502 });
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBytes(response, STUDIO_ASSET_MAX_BYTES);
    } catch (readError) {
      if (readError instanceof LogoTooLargeError) {
        return NextResponse.json({ error: 'The scanned logo file is larger than the 4 MB asset limit.' }, { status: 400 });
      }
      if (readError instanceof LogoUnreachableError) {
        return NextResponse.json({ error: readError.message }, { status: 400 });
      }
      throw readError;
    }
    if (bytes.length === 0) {
      return NextResponse.json({ error: 'The scanned logo source returned an empty file.' }, { status: 400 });
    }
    // Actual file signature wins over any declared content type.
    const type = sniffImageType(bytes);
    if (!type || !STUDIO_ASSET_ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'The brand logo is not a PNG, JPG, or WEBP image.' }, { status: 400 });
    }

    const assetId = crypto.randomUUID();
    const admin = createSupabaseAdminClient();
    const uploaded = await admin.storage.from(STUDIO_ASSET_BUCKET).upload(
      studioAssetStoragePath(organizationId, brandId, contentId, assetId, extensionFor(type)),
      Buffer.from(bytes),
      { contentType: type, cacheControl: '3600', upsert: false },
    );
    if (uploaded.error) throw uploaded.error;
    return NextResponse.json({ ok: true, src: studioAssetUrl(brandId, contentId, assetId) });
  } catch (error) {
    obs.error('Brand logo import failed', { error: error instanceof Error ? error.message : String(error) });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid Studio logo path' }, { status: 400 });
    return NextResponse.json({ error: 'Could not import the brand logo' }, { status: 500 });
  }
}
