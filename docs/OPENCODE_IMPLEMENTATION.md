# OpenCode Implementation Contract

This file is the working handoff for an AI coding agent operating on UpTrendifyOS.

## Mission

Build UpTrendifyOS as a production-oriented multi-tenant AI marketing agency OS.

Do not turn it into a generic AI blog generator. Preserve the golden workflow:

**Onboard → Research → Brand Brain → Strategy → Content → Review → Approve → Measure → Optimize**

## Before changing code

Read these in order:

1. `README.md`
2. `docs/PRD.md`
3. `docs/ARCHITECTURE.md`
4. `supabase/migrations/0001_initial_schema.sql`
5. `supabase/migrations/0002_rls.sql`

Inspect the existing repository before creating duplicate services.

## Non-negotiable engineering rules

- TypeScript strict mode.
- Never commit secrets.
- Server-side authorization on every tenant API.
- RLS is defense in depth, not the only authorization check.
- Brand data must never leak between clients/organizations.
- Research must store source URLs and timestamps.
- AI-inferred Brand Brain facts must remain distinguishable from user-confirmed facts.
- AI must not fabricate SEO metrics if a real provider is not configured.
- Public web research must have bounded page count/bytes/time and SSRF protection.
- High-impact operations such as publishing or deleting require explicit confirmation.
- Make jobs idempotent and retryable.
- Prefer small domain services over one giant route handler.

## Current foundation already exists

- Next.js 16 + TypeScript app shell
- premium dashboard UI
- Supabase SSR helpers
- validated environment schema
- health endpoint
- multi-tenant initial schema
- initial RLS policies
- client/brand creation API
- brand onboarding UI
- SSRF-aware URL validation
- bounded HTML extraction
- initial brand research service
- brand research API endpoint

Do not replace these without a concrete reason.

## Next implementation sequence

### Step 1 — Auth and organization bootstrap

Implement:
- login page
- email/password or magic-link auth
- authenticated layout
- organization bootstrap for the first user
- organization membership creation
- role checks
- logout
- protected routes

### Step 2 — Brand workspace

Implement:
- `/brands`
- `/brands/[brandId]/overview`
- `/brands/[brandId]/research`
- `/brands/[brandId]/brain`
- `/brands/[brandId]/seo`
- `/brands/[brandId]/strategy`
- `/brands/[brandId]/content`
- `/brands/[brandId]/campaigns`
- `/brands/[brandId]/analytics`

### Step 3 — Research pipeline

Upgrade research from synchronous request execution to a background-job interface.
The default local implementation may execute inline for development, but the domain API must expose job status and retries so Trigger.dev/Inngest can later replace the executor.

Add:
- robots/sitemap awareness where feasible
- page prioritization
- duplicate suppression
- content chunking
- source metadata
- research run progress
- retry action
- failure reasons

### Step 4 — Brand Brain

Build a structured Brand Brain view with editable facts:
- overview
- products/services
- audience
- personas
- pain points
- positioning
- differentiators
- voice
- vocabulary
- CTAs
- markets
- competitors
- content pillars
- SEO opportunities

Show evidence on every AI-derived fact.

### Step 5 — AI provider abstraction

Implement a server-only provider registry with:
- Groq adapter
- OpenAI adapter
- Anthropic adapter
- Gemini adapter

Provider selection must be deterministic and observable. Do not expose API keys to client code.

### Step 6 — Brand intelligence generation

Create an agent/service that transforms stored source evidence into Brand Brain candidates.
Output should be structured JSON validated with Zod.
Save evidence source IDs and confidence.

### Step 7 — Strategy generation

Generate structured strategies:
- goal
- audience
- positioning
- content pillars
- channels
- campaign ideas
- SEO opportunities
- roadmap
- KPIs
- assumptions

Implemented (migration `0005` + `lib/strategy/*`):
- Strategy generation consumes the Brand Brain snapshot (facts, insights, evidence claims, sources) rather than raw research.
- Output is a Zod-validated, 14-section schema (`lib/strategy/schema.ts`) persisted as structured JSON in `strategies.output`, alongside a capped `input_snapshot` and assumptions separated from evidence.
- Strategies are versioned per brand (`strategies` unique `(brand_id, version)`); endpoints enforce idempotency (`idempotency_key`) and an active-job guard (409).
- Job lifecycle uses `status/error_code/error_message/started_at/finished_at` on `strategies` and a linked `ai_tasks.strategy_id`; a single repair attempt recovers from malformed/off-schema model output, and invalid output is never persisted as SUCCEEDED.
- An audit log entry (`strategy.generated`) is written on success.

### Step 8 — Content Studio

Support:
- blog
- social post
- email
- landing-page copy
- campaign brief
- content brief

Implement versioning and statuses exactly as defined in the PRD.

### Step 9 — Review agent

Run a brand-constraint/source-coverage check on drafts before approval.
Never auto-publish.

### Step 10 — AI Command Center

Create a controlled tool-using agent that can:
- inspect selected brand context
- run research refresh
- summarize opportunities
- generate strategy
- create content drafts
- inspect content workflow status

Consequential operations require confirmation.

### Step 11 — Optional provider adapters

Create clean interfaces for:
- Semrush
- Surfer
- Jasper
- GoHighLevel

Do not make them required for core functionality.

### Step 12 — Testing

Add unit, integration and Playwright E2E tests for the golden journey.

Minimum E2E:
login → create client → create brand → research → inspect sources → Brand Brain → strategy → content → edit → review → approve

## UI quality bar

The application should feel like a premium SaaS product, not a generated admin template.
Use:
- strong typography
- restrained gradients
- thoughtful empty states
- skeleton loading
- error recovery
- keyboard shortcuts where useful
- command palette
- contextual AI actions
- responsive layouts

## Definition of done

Do not mark a feature complete just because files exist.
A feature is complete when:
1. it has an implemented UI,
2. it has an authenticated server/API path,
3. the database model supports it,
4. authorization is enforced,
5. errors/loading/empty states exist,
6. it has tests where practical,
7. it works locally with documented environment requirements.

## Reliability layer

- lib/ai/retry.ts: bounded transient retry with exponential backoff (default 3 attempts, 300ms base).
- lib/ai/classify.ts: deterministic provider-failure classification (RATE_LIMITED, SERVICE_UNAVAILABLE, NETWORK_ERROR, AUTHENTICATION_ERROR, VALIDATION_ERROR, PROVIDER_UNCONFIGURED, UNKNOWN); retryable flag drives retry, actionable flag drives UI retry guidance.
- lib/ai/http.ts: provider-status + request-runtime failures raised as AiProviderError; never retries auth/validation failures; never retries forever.
- app/api/health: provider registry health incl. per-provider availability without live AI calls; models read via env() only.
- Tests are deterministic (no live provider calls); only scripts/ai-verify-journey.cjs triggers controlled real AI.
- Failure UI: actionable "Retry" guidance; NO fabricated "AI generated" results.
