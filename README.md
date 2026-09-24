# UpTrendifyOS

> **AI-powered multi-brand marketing agency operating system.**

UpTrendifyOS is a production-oriented marketing operating system for agencies and businesses. An agency can manage multiple brands from one workspace; a business can focus on its own brand. The product turns a brand website into source-backed research, an editable Brand Brain, strategy, content, campaigns, approvals and controlled publishing workflows.

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
- `supabase/migrations/0005_strategy_engine.sql` — strategy lifecycle columns, `ai_tasks.strategy_id`, versioning.
- `.env.example` — safe environment-variable template.

### Current application foundation

The Next.js foundation uses the current Next.js 16 line, TypeScript, Supabase SSR support, Zod validation and a responsive SaaS design system. The application shell already includes the agency dashboard information architecture and the initial Brand Health / AI Recommendations experience.

## User workflow

Engineering phase numbers are implementation history, not instructions for users. The product guides users through one canonical journey:

**Workspace → Brand → Brand Ground Rules → Research → Brand Intelligence → Strategy → Content → Campaigns → Approval → Publishing**

## Golden V1 journey

1. Create or join a workspace (Agency or Business).
2. Add a brand and website URL.
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

For Supabase, create a project, enable the required extensions, and apply **all repository migrations in order through the current latest migration**. Production is currently synchronized through `0030_timezone_alias_normalization.sql`.

Recommended command when the Supabase project is linked:

```bash
npx supabase db push
```

The migration directory is the source of truth; do not selectively stop at the older 0001–0005 foundation migrations.

## Brand research & Brand Brain

The brand-overview journey starts from the dashboard (`/brands` → `/brands/[brandId]`):

1. **Start research** — `POST /api/brands/:brandId/research` queues a bounded website crawl for the brand's `website_url`. The request is idempotent via an optional `idempotencyKey`, and a second kick while a run is active returns `409`.
2. **Crawl** — an SSRF-guarded crawler visits public pages (bounded pages, bytes, redirects, time), stores canonical sources in `brand_sources`, links them to the run in `research_sources`, and writes text chunks to `brand_source_chunks`.
3. **AI extraction** — after the crawl completes, `brand_intelligence` analysis runs in the background: evidence is packed into a bounded context window and a JSON response is parsed against a strict schema (identity, audience, positioning, offer, messaging, SEO, competition + cited evidence claims). Transient provider errors (429/502/503, network drops) are retried with back-off.
4. **Brand Brain** — facts (`brand_facts`, `source_type = AI_INFERRED`) and insights (`brand_insights`, `metadata.origin = brand-intelligence`) are regenerated atomically each run; prior AI-inferred rows are replaced.
5. **Read** — `GET /api/brands/:brandId/brain` and `GET /api/brands/:brandId/research` (run history + AI task status) power the brand overview page, which auto-refreshes while a run is in progress.

Run states: `QUEUED → RUNNING → COMPLETED | PARTIAL | FAILED`. AI task states: `RUNNING → SUCCEEDED | FAILED | SKIPPED`. Everything is tenant-scoped by `organization_id` and every API/UI path re-checks membership + role (`CAN_RUN_RESEARCH` / `CAN_VIEW_BRAND`).

## Strategy engine

The strategy starting point is the **Brand Brain** (`/brands/[brandId]` → strategy section):

1. **Generate** — `POST /api/brands/:brandId/strategy` queues a strategy job (idempotent via `idempotencyKey`, `409` while one is active, versions auto-increment per brand).
2. **Context** — the pipeline loads the capped Brand Brain snapshot (facts, insights, evidence claims, sources) and renders it as markdown; strategies without brain context fail fast with `INSUFFICIENT_BRAIN` (no AI call).
3. **Generate** — `strategy_generation` runs against the default AI provider and returns a Zod-validated 14-section JSON document (executive summary, business understanding, objectives, ICP, positioning, messaging, content, SEO, channels, campaigns, 90-day roadmap, KPIs, risks/gaps, assumptions). A single repair attempt recovers from malformed output; invalid output is never persisted as SUCCEEDED.
4. **Persist** — validated output lands in `strategies.output` with an `input_snapshot` (assumptions separated from evidence), linked `ai_tasks` usage/latency, and an `audit_logs` `strategy.generated` entry.
5. **Read** — `GET /api/brands/:brandId/strategy` returns the latest version with full output plus version history and role-aware `canGenerate`; the dashboard shows strategy counts and recent strategy activity.

Strategy states: `QUEUED → RUNNING → SUCCEEDED | FAILED` with `error_code`/`error_message` (e.g. `STRATEGY_VALIDATION_FAILED`, `AI_GENERATION_FAILED`, `PROVIDER_UNCONFIGURED`). Generation is gated by `CAN_GENERATE_STRATEGY` (OWNER/ADMIN/STRATEGIST/EDITOR).

### AI provider

`DEFAULT_AI_PROVIDER` selects the primary provider (`gemini` by default) with Groq/OpenAI/Anthropic as alternates; configure keys in `.env.local`:

```text
GEMINI_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GEMINI_MODEL=gemini-3.7-flash
DEFAULT_AI_PROVIDER=groq
```

Without any configured key, the pipeline still records an AI task failure with `PROVIDER_UNCONFIGURED`; the rest of the application remains usable.

## Presentation replay mode

`AI_EXECUTION_MODE` controls whether AI runs for real (or at all):

- `live` (default) — production behavior. Research, Brand Brain and Strategy call the configured provider and surface live failure states.
- `replay` — deterministic presentation mode for the seeded **Aurora Labs** workspace. The app never calls a model; the `aurora-labs-presentation` organization replays from the bundled fixture (`lib/replay/fixtures/aurora.json`). Every other workspace keeps the normal live behavior, and a small "Presentation Replay" badge appears in the top bar while it is active.

The fixture data (`lib/replay/index.ts` + `lib/replay/fixtures/aurora.json`) is the single source of truth for both the seed and the replay runtime, so a watched demo always matches the seeded state.

### Set up a demo

```bash
# 1. Ensure migrations 0001–0007 are applied to local Supabase, then set:
cp .env.example .env.local       # fill NEXT_PUBLIC_SUPABASE_URL + the two Supabase keys
export AI_EXECUTION_MODE=replay  # (or .env.local: AI_EXECUTION_MODE=replay)

# 2. Seed the deterministic presentation workspace (idempotent, safe to re-run):
node scripts/seed-presentation.cjs

# 3. Run the app and sign in:
npm run dev
#   email:    presenter@uptrendify.local
#   password: uptrendify-demo
```

### Presentation flow

Open the **Aurora Labs** brand and walk: **Brand → Website Research → Brand Brain → Review → Approve → Brand Intelligence → Strategy**.

The seed pre-approves six Brand Brain facts (brand name, what the company does, industry, audience, value proposition, differentiators) so the strategy approval gate is already satisfied and a `SUCCEEDED` strategy v1 is visible immediately. The remaining suggestions are `PENDING` so a presenter reviews them live — approving/rejecting/editing/regenerating uses the normal review API. In replay mode, "Start research", "Generate strategy" and "Regenerate suggestion" complete deterministically and synchronously so the demo never waits on a model call.

Re-running `node scripts/seed-presentation.cjs` resets the brand to the pristine presentable state. To remove the workspace, delete the organization with `slug = aurora-labs-presentation`. Setting `AI_EXECUTION_MODE=live` (or unsetting it) restores full production behavior.

## Email confirmation (production)

The application uses Supabase Auth with the **PKCE** browser flow and hosted email confirmation. SMTP delivery (for example Pingram) is the transport; the confirmation link itself must use the SSR-safe token-hash flow.

In Supabase Dashboard → **Authentication → Email Templates → Confirm signup**, use the repository template at `supabase/templates/confirmation.html`. The important link is:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email
```

Also add the deployed application URL as an allowed redirect/site URL in Supabase Auth URL configuration. The app dynamically uses the current origin for signup/resend links, so local and hosted environments keep their own URLs.

Flow:

`Register → Supabase creates pending user → Pingram sends confirmation → /auth/confirm verifies token_hash → SSR session cookie is established → onboarding/dashboard`

The app also provides **Resend confirmation email** on both the registration confirmation screen and the login screen when an account is still unconfirmed.

## Production synchronization diagnostics

Owners and Admins can open **Settings → System health** to verify the deployed Browser → Vercel → Supabase boundary. The diagnostics page checks the active deployment identity, effective Supabase project, Auth reachability, tenant membership, and runtime schema contracts for onboarding, campaigns, publishing, preferences, tours, and team invitations.

`/api/health` is a fast public liveness/config probe; external reachability is reported as telemetry rather than turning the app into a 503. `/api/diagnostics` is authenticated and is intentionally the deeper Browser → Vercel → Supabase readiness/contract check.

## Local verification

```bash
npm run typecheck
npm test          # unit tests across lib/ai, lib/research, lib/strategy, and API routes
npm run build     # next build (all app + API routes)
```

Full end-to-end verification boots the app with a real provider against local Supabase:

```bash
VERIFY_APP=http://localhost:3000 VERIFY_PROVIDER=gemini node /tmp/opencode/verify-research.cjs
VERIFY_APP=http://localhost:3100 node /tmp/opencode/verify-strategy.cjs   # with GEMINI_MODEL=gemini-3.6-flash dev server
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

UpTrendifyOS should feel like a calm, modern combination of an agency command center, AI workspace and SaaS product — not a generic admin template. Light is the default for long daily usage; users can switch between Light, Dark and System.

The visual language is:
- light-first default with a complete dark/system theme
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
