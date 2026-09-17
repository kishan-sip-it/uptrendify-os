# UpTrendifyOS

> **AI-powered multi-brand marketing agency operating system.**

UpTrendifyOS is a production-oriented platform for agencies that manage multiple clients and brands from one workspace. It turns a brand URL into source-backed intelligence, an editable Brand Brain, marketing strategy, SEO/content opportunities and controlled content workflows.

## Core loop

**Onboard → Research → Understand → Strategize → Generate → Review → Approve → Publish → Measure → Optimize**

## Repository status

The repository has now been initialized around a real production architecture rather than a mini-project prototype.

### Product documents

- `docs/PRD.md` — product requirements and acceptance criteria.
- `docs/ARCHITECTURE.md` — application, AI, security, research and deployment architecture.
- `supabase/migrations/0001_initial_schema.sql` — multi-tenant database schema.
- `supabase/migrations/0002_rls.sql` — tenant-isolation policies.
- `supabase/migrations/0003_hardening.sql` — hardening constraints, indexes, cleanup.
- `supabase/migrations/0004_brand_intelligence.sql` — research/brain task linkage and indexes.
- `.env.example` — safe environment-variable template.

### Current application foundation

The initial Next.js foundation uses the current Next.js 16 line, TypeScript, Supabase SSR support, Zod validation and a custom premium SaaS design system. The application shell already includes the agency dashboard information architecture and the initial Brand Health / AI Recommendations experience.

## Golden V1 journey

1. Create client.
2. Add brand and website URL.
3. Analyze permitted public website content.
4. Store evidence and research status.
5. Build an editable Brand Brain.
6. Generate strategy.
7. Generate brand-specific content.
8. Version and review content.
9. Approve before consequential publishing actions.
10. Measure and optimize.

## Suggested local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

For Supabase, create a project, enable `pgcrypto` and `pgvector`, and apply migrations in order:

```text
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_hardening.sql
supabase/migrations/0004_brand_intelligence.sql
```

## Brand research & Brand Brain

The brand-overview journey starts from the dashboard (`/brands` → `/brands/[brandId]`):

1. **Start research** — `POST /api/brands/:brandId/research` queues a bounded website crawl for the brand's `website_url`. The request is idempotent via an optional `idempotencyKey`, and a second kick while a run is active returns `409`.
2. **Crawl** — an SSRF-guarded crawler visits public pages (bounded pages, bytes, redirects, time), stores canonical sources in `brand_sources`, links them to the run in `research_sources`, and writes text chunks to `brand_source_chunks`.
3. **AI extraction** — after the crawl completes, `brand_intelligence` analysis runs in the background: evidence is packed into a bounded context window and a JSON response is parsed against a strict schema (identity, audience, positioning, offer, messaging, SEO, competition + cited evidence claims). Transient provider errors (429/502/503, network drops) are retried with back-off.
4. **Brand Brain** — facts (`brand_facts`, `source_type = AI_INFERRED`) and insights (`brand_insights`, `metadata.origin = brand-intelligence`) are regenerated atomically each run; prior AI-inferred rows are replaced.
5. **Read** — `GET /api/brands/:brandId/brain` and `GET /api/brands/:brandId/research` (run history + AI task status) power the brand overview page, which auto-refreshes while a run is in progress.

Run states: `QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED`. AI task states: `RUNNING → SUCCEEDED | FAILED | SKIPPED`. Everything is tenant-scoped by `organization_id` and every API/UI path re-checks membership + role (`CAN_RUN_RESEARCH` / `CAN_VIEW_BRAND`).

### AI provider

`DEFAULT_AI_PROVIDER` selects the primary provider (`gemini` by default) with Groq/OpenAI/Anthropic as alternates; configure keys in `.env.local`:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
DEFAULT_AI_PROVIDER=gemini
```

Without any configured key, the pipeline still runs and records an AI task failed with `PROVIDER_UNCONFIGURED`.

## Local verification

```bash
npm run typecheck
npm test          # 115 unit tests across lib/ai, lib/research, and API routes
npm run build     # next build (all app + API routes)
```

Full end-to-end verification boots the app with a real provider against local Supabase:

```bash
VERIFY_APP=http://localhost:3000 VERIFY_PROVIDER=gemini node /tmp/opencode/verify-research.cjs
```

## AI integrations

UpTrendifyOS uses a provider abstraction so the core application does not depend on one vendor.

Initial providers:
- Groq
- OpenAI
- Anthropic
- Gemini

Optional adapters can be added for:
- Semrush
- Surfer
- Jasper
- GoHighLevel

These are integrations, not the application's source of truth.

## Security principles

- Never commit secrets.
- Use Supabase RLS plus server-side authorization.
- Keep service-role credentials server-only.
- Validate and restrict research URLs to reduce SSRF risk.
- Bound crawl size, response bytes, redirects and execution time.
- Store source evidence and timestamps for AI-derived insights.
- Require explicit confirmation for publishing/deleting/high-impact actions.
- Keep tenant data isolated by `organization_id`.

## Design direction

UpTrendifyOS should feel like a premium combination of an agency command center, AI workspace and modern SaaS product — not a generic admin template.

The visual language is:
- premium dark-first UI with light-theme support later
- Space Grotesk / DM Sans typography
- subtle gradients and glass/surface depth
- clean information density
- intelligent progress states
- command-center interactions
- responsive dashboards

## Build order

### Phase 0 — Foundation
Repository, architecture, database, RLS, environment, design system.

### Phase 1 — Agency core
Authentication, organizations, roles, clients, brands, dashboard.

### Phase 2 — Brand Intelligence
URL ingestion, research jobs, evidence storage, Brand Brain.

### Phase 3 — Growth Intelligence
SEO opportunities, competitors, strategy generation.

### Phase 4 — Content Operations
Content Studio, versions, reviews, approvals, campaigns.

### Phase 5 — AI Command Center
Tool-using agent with controlled domain actions and audit logs.

### Phase 6 — External providers
Semrush, Surfer, Jasper and GHL adapters where credentials/licensing exist.

### Phase 7 — Production hardening
Tests, observability, retries, rate limiting, deployment and security verification.
