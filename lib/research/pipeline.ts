import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crawlBrand, type ProcessedPage } from './crawler';
import { chunkTextBounded } from './chunk';
import { analyzeResearchEvidence } from './brain';
import { translateResearchError } from './errors';
import { obs } from '@/lib/obs/logger';

export const MAX_CHUNKS_PER_SOURCE = 25;
export const CHUNK_MAX_CHARS = 2000;
export const CHUNK_OVERLAP = 150;

export type ResearchPipelineInput = {
  supabase: SupabaseClient;
  organizationId: string;
  brandId: string;
  websiteUrl: string;
  researchRunId: string;
};

export type PipelineOutcome = {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  pagesProcessed: number;
  pagesDiscovered: number;
  brainStatus: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
};

export async function persistSourceChunks(
  supabase: SupabaseClient,
  args: { organizationId: string; brandId: string; researchRunId: string; pages: ProcessedPage[] },
): Promise<number> {
  const { organizationId, brandId, researchRunId, pages } = args;
  let stored = 0;
  for (const page of pages) {
    const chunks = chunkTextBounded(page.text, MAX_CHUNKS_PER_SOURCE, { maxChars: CHUNK_MAX_CHARS, overlapChars: CHUNK_OVERLAP });
    if (chunks.length === 0) continue;
    const rows = chunks.map((content, chunkIndex) => ({
      organization_id: organizationId,
      brand_id: brandId,
      source_id: page.id,
      chunk_index: chunkIndex,
      content,
      metadata: { researchRunId } as Record<string, unknown>,
    }));
    const result = await supabase.from('brand_source_chunks').upsert(rows, { onConflict: 'source_id,chunk_index' });
    if (result.error) throw result.error;
    stored += rows.length;
  }
  obs.info('Research chunks stored', { researchRunId, brandId, chunks: stored });
  return stored;
}

export async function runResearchPipeline(input: ResearchPipelineInput): Promise<PipelineOutcome> {
  const { supabase, organizationId, brandId, websiteUrl, researchRunId } = input;
  const crawl = await crawlBrand(supabase, { organizationId, brandId, websiteUrl, researchRunId });

  if (crawl.pagesProcessed > 0) {
    await persistSourceChunks(supabase, { organizationId, brandId, researchRunId, pages: crawl.processedPages });
    const brain = await analyzeResearchEvidence(supabase, { organizationId, brandId, researchRunId });

    // A crawl is not a fully successful research run when Brand Brain analysis
    // fails or has no usable evidence. Preserve the run as PARTIAL so downstream
    // gates never mistake an incomplete intelligence pipeline for success.
    if (brain.status === 'FAILED' || brain.status === 'SKIPPED') {
      const code = brain.errorCode ?? 'BRAIN_ANALYSIS_INCOMPLETE';
      const message = brain.errorMessage ?? 'Brand intelligence could not be completed.';
      const status = crawl.status === 'FAILED' ? 'FAILED' : 'PARTIAL';
      const update = await supabase
        .from('research_runs')
        .update({
          status,
          error_code: code,
          error_message: message.slice(0, 600),
          finished_at: new Date().toISOString(),
        })
        .eq('id', researchRunId)
        .eq('organization_id', organizationId);
      if (update.error) throw update.error;

      return {
        status,
        pagesProcessed: crawl.pagesProcessed,
        pagesDiscovered: crawl.pagesDiscovered,
        brainStatus: brain.status,
      };
    }

    return {
      status: crawl.status,
      pagesProcessed: crawl.pagesProcessed,
      pagesDiscovered: crawl.pagesDiscovered,
      brainStatus: brain.status,
    };
  }

  return {
    status: crawl.status,
    pagesProcessed: 0,
    pagesDiscovered: crawl.pagesDiscovered,
    brainStatus: 'SKIPPED',
  };
}

const TRANSIENT_RESEARCH_ERROR_CODES = new Set([
  'DNS_TEMPORARY_FAILURE',
  'REQUEST_TIMEOUT',
  'CONNECTION_TIMEOUT',
  'CONNECTION_RESET',
  'CONNECTION_FAILED',
  'NETWORK_UNREACHABLE',
]);

async function executeResearchWithTransientRetry(input: ResearchPipelineInput): Promise<PipelineOutcome> {
  try {
    return await runResearchPipeline(input);
  } catch (error) {
    const info = translateResearchError(error);
    if (!TRANSIENT_RESEARCH_ERROR_CODES.has(info.code)) throw error;

    obs.warn('Retrying research pipeline after transient startup/network failure', {
      researchRunId: input.researchRunId,
      brandId: input.brandId,
      errorCode: info.code,
      error: info.message,
    });

    await new Promise((resolve) => setTimeout(resolve, 750));
    return runResearchPipeline(input);
  }
}

export function scheduleResearchExecution(input: ResearchPipelineInput): void {
  after(() => {
    return executeResearchWithTransientRetry(input).catch(async (error) => {
      const info = translateResearchError(error);
      obs.error('Research pipeline failed', {
        researchRunId: input.researchRunId,
        brandId: input.brandId,
        error: info.message,
        errorCode: info.code,
      });
      try {
        const current = await input.supabase
          .from('research_runs')
          .select('status')
          .eq('id', input.researchRunId)
          .eq('organization_id', input.organizationId)
          .maybeSingle();

        if (current.error) throw current.error;

        const targetStatus = current.data?.status === 'COMPLETED' ? 'PARTIAL' : 'FAILED';
        await input.supabase
          .from('research_runs')
          .update({
            status: targetStatus,
            finished_at: new Date().toISOString(),
            error_code: targetStatus === 'PARTIAL' ? 'PARTIAL_PIPELINE_FAILURE' : info.code,
            error_message: info.message.slice(0, 600),
          })
          .eq('id', input.researchRunId)
          .eq('organization_id', input.organizationId);
      } catch (markError) {
        obs.error('Failed to mark research run failed', {
          researchRunId: input.researchRunId,
          error: markError instanceof Error ? markError.message : String(markError),
        });
      }
    });
  });
}
