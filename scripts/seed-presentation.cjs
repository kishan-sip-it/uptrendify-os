#!/usr/bin/env node
/**
 * UpTrendifyOS — Presentation fixture seed.
 *
 * Seeds a deterministic "Aurora Labs" presentation workspace used by the
 * AI_EXECUTION_MODE=replay replay mode. Idempotent: safe to re-run, it
 * re-creates brand-scoped rows so the demo always starts from a known state.
 *
 * Requires a running local/remote Supabase and .env.local values for
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/seed-presentation.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = require(path.join(ROOT, 'lib', 'replay', 'fixtures', 'aurora.json'));

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('export ') === false && line.includes('=') === false) continue;
    const clear = line.startsWith('export ') ? line.slice(7) : line;
    if (clear.startsWith('#')) continue;
    process.env[clear.slice(0, clear.indexOf('='))] = clear.slice(clear.indexOf('=') + 1);
  }
}

loadEnvLocal();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function fail(step, error) {
  console.error(`\nSeed failed at "${step}": ${error && error.message ? error.message : error}`);
  process.exit(1);
}

function chunkText(text, maxChars = 2000, overlap = 150, maxChunks = 25) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const chunks = [];
  let start = 0;
  while (start < clean.length && chunks.length < maxChunks) {
    chunks.push(clean.slice(start, start + maxChars));
    if (start + maxChars >= clean.length) break;
    start = start + maxChars - overlap;
  }
  if (clean.length > start && chunks.length < maxChunks) chunks.push(clean.slice(start));
  return chunks;
}

async function upsertOrg() {
  const { data: existing } = await admin.from('organizations').select('id,slug').eq('slug', FIXTURE.meta.organizationSlug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.from('organizations').insert({ name: FIXTURE.meta.organizationName, slug: FIXTURE.meta.organizationSlug }).select('id').single();
  if (error) fail('create organization', error);
  return data.id;
}

async function upsertClient(organizationId) {
  const { data: existing } = await admin.from('clients').select('id,slug').eq('organization_id', organizationId).eq('slug', FIXTURE.meta.clientSlug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin
    .from('clients')
    .insert({ organization_id: organizationId, name: FIXTURE.meta.clientName, slug: FIXTURE.meta.clientSlug, description: 'Presentation demo client for replay mode.' })
    .select('id')
    .single();
  if (error) fail('create client', error);
  return data.id;
}

async function upsertBrand(organizationId, clientId) {
  const { data: existing } = await admin.from('brands').select('id,slug').eq('client_id', clientId).eq('slug', FIXTURE.meta.brandSlug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin
    .from('brands')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      name: FIXTURE.meta.brandName,
      slug: FIXTURE.meta.brandSlug,
      website_url: FIXTURE.meta.brandUrl,
      industry: FIXTURE.meta.brandIndustry,
      market_country: FIXTURE.meta.marketCountry,
      target_audience: FIXTURE.meta.targetAudience,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (error) fail('create brand', error);
  return data.id;
}

async function ensureUser() {
  const email = FIXTURE.meta.presenterUser.email;
  const password = FIXTURE.meta.presenterUser.password;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: FIXTURE.meta.presenterUser.firstName, last_name: FIXTURE.meta.presenterUser.lastName },
    });
    if (error) throw error;
    return data.user.id;
  } catch (error) {
    const { data: pages, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) fail('list users', listError);
    const match = (pages.users || []).find((user) => user.email === email);
    if (!match) fail('ensure presenter user', error);
    return match.id;
  }
}

async function upsertMembership(organizationId, userId) {
  const { error: memberError } = await admin.from('organization_members').upsert(
    [{ organization_id: organizationId, user_id: userId, role: 'OWNER' }],
    { onConflict: 'organization_id,user_id' },
  );
  if (memberError) fail('create membership', memberError);

  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      user_id: userId,
      organization_id: organizationId,
      first_name: FIXTURE.meta.presenterUser.firstName,
      last_name: FIXTURE.meta.presenterUser.lastName,
      role: 'OWNER',
      onboarding_completed: true,
    },
    { onConflict: 'user_id' },
  );
  if (profileError) fail('create profile', profileError);
}

async function resetBrandData(organizationId, brandId) {
  const scope = (table) => admin.from(table).delete().eq('organization_id', organizationId).eq('brand_id', brandId);
  // Order matters: strategies + ai_tasks before research_runs (ai_tasks keep a
  // strategy_id FK with ON DELETE SET NULL), then brand_sources cascades
  // research_sources + source chunks.
  for (const table of ['brand_facts', 'brand_insights', 'brand_suggestions', 'strategies']) {
    const { error } = await scope(table);
    if (error) fail(`reset ${table}`, error);
  }
  const { error: aiError } = await admin.from('ai_tasks').delete().eq('organization_id', organizationId).eq('brand_id', brandId);
  if (aiError) fail('reset ai_tasks', aiError);
  const { error: runsError } = await admin.from('research_runs').delete().eq('organization_id', organizationId).eq('brand_id', brandId);
  if (runsError) fail('reset research_runs', runsError);
  const { error: sourcesError } = await admin.from('brand_sources').delete().eq('organization_id', organizationId).eq('brand_id', brandId);
  if (sourcesError) fail('reset brand_sources', sourcesError);
}

async function seedResearch(organizationId, brandId, userId) {
  const now = new Date().toISOString();
  const { data: run, error: runError } = await admin
    .from('research_runs')
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      status: 'COMPLETED',
      idempotency_key: FIXTURE.meta.fallbackIdempotencyKeys.research,
      pages_discovered: FIXTURE.run.pagesDiscovered,
      pages_processed: FIXTURE.run.pagesProcessed,
      provider: FIXTURE.meta.providerLabel,
      model: FIXTURE.meta.modelLabel,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();
  if (runError) fail('seed research run', runError);
  const researchRunId = run.id;

  const { data: sources, error: sourcesError } = await admin
    .from('brand_sources')
    .insert(
      FIXTURE.sources.map((source) => ({
        organization_id: organizationId,
        brand_id: brandId,
        url: source.url,
        canonical_url: source.canonicalUrl,
        title: source.title,
        content_type: source.contentType,
        status: 'ACTIVE',
        http_status: source.httpStatus,
        retrieved_at: now,
        extracted_text: source.text,
        metadata: { replay: true, researchRunId },
      })),
    )
    .select('id,url,canonical_url');
  if (sourcesError) fail('seed brand sources', sourcesError);

  const byCanonical = new Map();
  const titleByUrl = {};
  for (const source of sources) {
    const identifier = source.canonical_url || source.url;
    byCanonical.set(identifier, source);
    byCanonical.set(source.url, source);
    titleByUrl[identifier] = FIXTURE.sources.find((entry) => entry.canonicalUrl === source.canonical_url)?.title ?? null;
    titleByUrl[source.url] = FIXTURE.sources.find((entry) => entry.canonicalUrl === source.canonical_url)?.title ?? null;
  }
  const sourceByUrl = {};
  for (const source of sources) {
    const identifier = source.canonical_url || source.url;
    sourceByUrl[identifier] = source.id;
    sourceByUrl[source.url] = source.id;
  }

  const { error: linkError } = await admin.from('research_sources').insert(
    sources.map((source) => ({
      organization_id: organizationId,
      research_run_id: researchRunId,
      source_id: source.id,
      status: 'PROCESSED',
    })),
  );
  if (linkError) fail('seed research sources link', linkError);

  for (const source of sources) {
    const entry = FIXTURE.sources.find((candidate) => candidate.canonicalUrl === source.canonical_url);
    const chunks = chunkText(entry?.text ?? '');
    if (chunks.length === 0) continue;
    const { error: chunkError } = await admin.from('brand_source_chunks').insert(
      chunks.map((content, index) => ({
        organization_id: organizationId,
        brand_id: brandId,
        source_id: source.id,
        chunk_index: index,
        content,
        metadata: { researchRunId, replay: true },
      })),
    );
    if (chunkError) fail('seed source chunks', chunkError);
  }

  const { error: brainError } = await admin.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    research_run_id: researchRunId,
    task_type: 'brand_intelligence',
    status: 'SUCCEEDED',
    provider: FIXTURE.meta.providerLabel,
    model: FIXTURE.meta.modelLabel,
    idempotency_key: `brain:${researchRunId}`,
    input_metadata: { replay: true, evidenceSources: FIXTURE.sources.length },
    output_metadata: { replay: true, insights: FIXTURE.insights.length, researchRunId },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (brainError) fail('seed brain ai task', brainError);

  const approvedSet = new Set(FIXTURE.approvedFields);
  const suggestionRows = FIXTURE.suggestions.map((suggestion) => {
    const approved = approvedSet.has(suggestion.field);
    const evidence = suggestion.evidence.map((item) => ({
      sourceId: sourceByUrl[item.url] ?? null,
      url: item.url,
      urlTitle: titleByUrl[item.url] ?? null,
      excerpt: item.excerpt ?? null,
      claim: item.claim,
      strength: item.strength,
    }));
    const strengths = evidence.map((item) => item.strength);
    const evidenceStrength = strengths.includes('strong') ? 'strong' : strengths.includes('partial') ? 'partial' : 'weak';
    return {
      organization_id: organizationId,
      brand_id: brandId,
      research_run_id: researchRunId,
      field: suggestion.field,
      label: suggestion.label,
      kind: suggestion.kind,
      proposed_value: suggestion.proposedValue,
      status: approved ? 'APPROVED' : 'PENDING',
      evidence: approved ? evidence : evidence,
      evidence_strength: suggestion.proposedValue === null ? null : evidenceStrength,
      sources_examined: FIXTURE.sources.length,
      confidence: suggestion.confidence,
      reviewed_at: approved ? now : null,
      reviewed_by: approved ? userId : null,
    };
  });

  const { error: suggestionsError } = await admin.from('brand_suggestions').insert(suggestionRows);
  if (suggestionsError) fail('seed suggestions', suggestionsError);

  const facts = FIXTURE.suggestions
    .filter((suggestion) => approvedSet.has(suggestion.field))
    .map((suggestion) => {
      const evidenceIds = suggestion.evidence
        .map((item) => sourceByUrl[item.url] ?? null)
        .filter((id) => id !== null);
      return {
        organization_id: organizationId,
        brand_id: brandId,
        key: suggestion.field,
        value: suggestion.proposedValue,
        source_type: 'USER_CONFIRMED',
        confidence: suggestion.confidence,
        evidence_source_ids: evidenceIds,
        approved: true,
      };
    });
  if (facts.length > 0) {
    const { error: factsError } = await admin.from('brand_facts').insert(facts);
    if (factsError) fail('seed facts', factsError);
  }

  const { error: insightsError } = await admin.from('brand_insights').insert(
    FIXTURE.insights.map((insight) => ({
      organization_id: organizationId,
      brand_id: brandId,
      category: insight.category,
      title: insight.title,
      description: insight.description,
      priority: insight.priority,
      evidence_source_ids: [],
      metadata: {
        origin: 'brand-intelligence',
        researchRunId,
        ...(insight.claimUrl ? { claimUrl: insight.claimUrl } : {}),
      },
    })),
  );
  if (insightsError) fail('seed insights', insightsError);

  await admin.from('audit_logs').insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: 'research.completed',
    entity_type: 'brand',
    entity_id: brandId,
    metadata: { replay: true, provider: FIXTURE.meta.providerLabel, researchRunId },
  });

  return { researchRunId, sources };
}

async function seedStrategy(organizationId, brandId, userId, researchRunId, sourceCount) {
  const now = new Date().toISOString();
  const { data: strategy, error: strategyError } = await admin
    .from('strategies')
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      title: `${FIXTURE.meta.brandName} — Marketing Strategy`,
      version: 1,
      status: 'SUCCEEDED',
      provider: FIXTURE.meta.providerLabel,
      model: FIXTURE.meta.modelLabel,
      output: FIXTURE.strategy,
      input_snapshot: {
        researchRunId,
        brand: {
          name: FIXTURE.meta.brandName,
          websiteUrl: FIXTURE.meta.brandUrl,
          industry: FIXTURE.meta.brandIndustry,
          marketCountry: FIXTURE.meta.marketCountry,
          targetAudience: FIXTURE.meta.targetAudience,
        },
        facts: FIXTURE.approvedFields.length,
        insights: FIXTURE.insights.filter((insight) => insight.category !== 'EVIDENCE').length,
        evidenceClaims: FIXTURE.insights.filter((insight) => insight.category === 'EVIDENCE').length,
        sources: sourceCount,
      },
      created_by: userId,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();
  if (strategyError) fail('seed strategy', strategyError);

  const { error: strategyTaskError } = await admin.from('ai_tasks').insert({
    organization_id: organizationId,
    brand_id: brandId,
    strategy_id: strategy.id,
    task_type: 'strategy_generation',
    status: 'SUCCEEDED',
    provider: FIXTURE.meta.providerLabel,
    model: FIXTURE.meta.modelLabel,
    idempotency_key: `strategy:${strategy.id}`,
    input_metadata: { replay: true, researchRunId },
    output_metadata: { replay: true, objectives: FIXTURE.strategy.objectives.length, channels: FIXTURE.strategy.channels.length },
    latency_ms: 0,
    started_at: now,
    finished_at: now,
  });
  if (strategyTaskError) fail('seed strategy ai task', strategyTaskError);

  await admin.from('audit_logs').insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: 'strategy.generated',
    entity_type: 'strategy',
    entity_id: strategy.id,
    metadata: { replay: true, provider: FIXTURE.meta.providerLabel, version: 1 },
  });

  return strategy.id;
}

(async () => {
  console.log(`\nSeeding presentation fixture "${FIXTURE.meta.brandName}" (${FIXTURE.meta.organizationSlug})\n`);

  const organizationId = await upsertOrg();
  const clientId = await upsertClient(organizationId);
  const brandId = await upsertBrand(organizationId, clientId);
  const userId = await ensureUser();
  await upsertMembership(organizationId, userId);
  await resetBrandData(organizationId, brandId);

  const { researchRunId, sources } = await seedResearch(organizationId, brandId, userId);
  await seedStrategy(organizationId, brandId, userId, researchRunId, sources.length);

  console.log('✔ Organization        ', FIXTURE.meta.organizationName);
  console.log('✔ Client              ', FIXTURE.meta.clientName);
  console.log('✔ Brand               ', FIXTURE.meta.brandName, `(${FIXTURE.meta.brandUrl})`);
  console.log('✔ Presenter user      ', `${FIXTURE.meta.presenterUser.email} / ${FIXTURE.meta.presenterUser.password}`);
  console.log('✔ Research run        ', 'COMPLETED');
  console.log('✔ Suggestions         ', `${FIXTURE.suggestions.length} (${FIXTURE.approvedFields.length} pre-approved)`);
  console.log('✔ Approved facts      ', FIXTURE.approvedFields.length);
  console.log('✔ Insights            ', FIXTURE.insights.length);
  console.log('✔ Strategy v1         ', 'SUCCEEDED');
  console.log('✔ AI tasks            ', `replay / ${FIXTURE.meta.modelLabel}`);
  console.log('\nNext steps:');
  console.log('  1. Next.js on port 3000, run the app and sign in at http://localhost:3000/login');
  console.log('  2. During the demo, keep AI_EXECUTION_MODE=replay in the environment so no live model is called.');
  console.log('  3. Open the Aurora Labs brand and walk the flow:');
  console.log('     Brand → Website Research → Brand Brain → Review → Approve → Brand Intelligence → Strategy.');
  console.log('  4. Re-run `node scripts/seed-presentation.cjs` any time to reset the demo.');
  console.log('');
})().catch((error) => {
  console.error(`\nSeed failed: ${error && error.message ? error.message : error}`);
  process.exit(1);
});