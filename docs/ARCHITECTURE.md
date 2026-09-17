# UpTrendifyOS — Production Architecture

## 1. Architecture principles

1. Multi-tenant by default: every business record is scoped to an organization and authorized server-side.
2. Brand context is durable: research is stored as evidence and normalized into an editable Brand Brain.
3. AI is provider-agnostic: application services call a stable provider interface instead of vendor SDKs directly.
4. Research is asynchronous: crawling and AI analysis run as jobs with status, retries and idempotency.
5. Evidence before inference: AI-generated facts retain source references and confidence metadata.
6. Human approval for consequential actions: content generation can be automated; publication/deletion requires explicit authorization.
7. Vendor integrations are adapters: Semrush, Surfer, Jasper and GHL are optional, never the system of record.
8. Secure web research: URL fetches require SSRF controls, redirect limits, response-size limits and allowlisted protocols.

## 2. Logical architecture

```text
Browser / Next.js UI
        |
        v
Authenticated App Router / Route Handlers
        |
        +------------------- Domain Services -------------------+
        |             |              |             |             |
        v             v              v             v             v
  Brand Service  Research       Content       Strategy       AI Command
                    Service       Service       Service          Center
        |             |              |             |             |
        +-------------+--------------+-------------+--------------+
                              |
                     Provider / Adapter Layer
                  /       |        |        \
              Groq    OpenAI   Anthropic   Gemini
                  \       |        |        /
                   Optional external adapters
              Semrush / Surfer / Jasper / GHL
                              |
                         PostgreSQL
                           + pgvector
                              |
                   Supabase Storage / Auth
                              |
                      Background Job Runner
                       research / AI / sync
```

## 3. Recommended stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth + PostgreSQL + Storage
- pgvector for source/Brand Brain semantic retrieval
- Zod for request/env validation
- Vitest for unit tests
- Playwright for end-to-end tests
- Background jobs through a provider-neutral job interface; Trigger.dev/Inngest can be plugged in without changing domain services
- Vercel for application deployment

## 4. Repository structure

```text
app/
  (auth)/login/
  (dashboard)/dashboard/
  (dashboard)/clients/
  (dashboard)/brands/
  (dashboard)/brands/new/
  (dashboard)/brands/[brandId]/overview/
  (dashboard)/brands/[brandId]/research/
  (dashboard)/brands/[brandId]/brain/
  (dashboard)/brands/[brandId]/seo/
  (dashboard)/brands/[brandId]/strategy/
  (dashboard)/brands/[brandId]/content/
  (dashboard)/brands/[brandId]/campaigns/
  (dashboard)/brands/[brandId]/analytics/
  (dashboard)/approvals/
  (dashboard)/ai/
  (dashboard)/settings/
  api/
components/
  ui/
  layout/
  brand/
  content/
  research/
  dashboard/
lib/
  auth/
  db/
  env/
  ai/
    providers/
    prompts/
  research/
    crawler/
    extractors/
    security/
  domain/
    brands/
    clients/
    content/
    strategy/
  integrations/
    semrush/
    surfer/
    jasper/
    ghl/
  jobs/
  observability/
  security/
  validation/
  utils/
supabase/
  migrations/
docs/
  PRD.md
  ARCHITECTURE.md
```

## 5. Request flow: Add Brand

```text
User submits company + URL
        |
        v
Server validates input with Zod
        |
        v
Create brand record
        |
        v
Create research_run(status=QUEUED)
        |
        v
Queue research job
        |
        v
Research worker
  -> normalize URL
  -> validate target
  -> fetch allowed pages
  -> extract readable content
  -> deduplicate sources
  -> chunk content
  -> embed chunks
  -> store evidence
        |
        v
Brand Intelligence job
  -> synthesize Brand Brain candidates
  -> attach evidence IDs
  -> assign confidence
        |
        v
Brand Brain = REVIEW_REQUIRED
        |
        v
User confirms/edit facts
        |
        v
Brand Brain = ACTIVE
```

## 6. Web research security

The fetcher must:

- accept only http/https URLs
- resolve DNS and reject private/link-local/loopback targets
- cap redirects
- cap response bytes
- cap pages and total crawl time
- use a clear user-agent
- avoid executing arbitrary JavaScript server-side
- respect configured crawling/robots policies
- reject unsupported content types
- sanitize extracted HTML
- never forward server credentials to target sites
- record source URL and retrieval timestamp

The system should start with a conservative crawl scope: homepage, common marketing pages, selected internal links, sitemap when available, and explicit user-supplied pages. It must not perform an unbounded site crawl.

## 7. Brand Brain model

The Brand Brain is assembled from three evidence classes:

- `USER_CONFIRMED`: directly entered or approved by a user
- `SOURCE_DERIVED`: extracted from a stored source
- `AI_INFERRED`: synthesized interpretation requiring evidence references

Every AI-inferred fact should retain source references and confidence. User edits supersede generated candidates.

## 8. AI provider architecture

```ts
interface AiProvider {
  id: string;
  models(): Promise<string[]>;
  generate(input: GenerateInput): Promise<GenerateResult>;
  stream?(input: GenerateInput): AsyncIterable<string>;
  health(): Promise<ProviderHealth>;
}
```

Application services depend on `AiProviderRegistry` rather than a vendor SDK.

Initial live providers:
- Groq
- OpenAI
- Anthropic
- Gemini

The default selection is configured through environment variables. Provider failures must be classified and retried only when safe.

Implemented for brand research: the pipeline schedules the crawl via `after()` after the API response, then runs `brand_intelligence` extraction against a bounded evidence context (10 sources / ~8k chars each) with a strict Zod schema (identity, audience, positioning, offer, messaging, SEO, competition + cited evidence claims). Transient provider errors (429/502/503 and network failures) are retried with exponential back-off; every task records its provider, model, latency and token usage in `ai_tasks`, and extracted facts/insights are regenerated atomically per run (`source_type = AI_INFERRED`, `metadata.origin = brand-intelligence`).

## 9. Agent architecture

Agents are domain services with constrained tools, not unrestricted autonomous loops.

### Research Agent tools
- `fetch_page`
- `discover_links`
- `read_sitemap`
- `store_source`

### Brand Intelligence Agent
No external side effects. Reads research evidence and proposes structured facts.

### SEO Agent tools
- internal content analyzer
- keyword-gap adapter when configured
- optional Semrush/Surfer adapters

### Strategy Agent
Read-only except creation of draft strategy objects.

### Content Agent
Creates drafts and versions. Cannot publish.

### Review Agent
Produces warnings and checks brand constraints, unsupported claims, forbidden content and source coverage.

### AI Command Center
Routes a user request to domain tools. Any high-impact operation must return a confirmation requirement rather than execute immediately.

## 10. Job architecture

Each job should have:
- id
- organization_id
- brand_id when applicable
- type
- idempotency_key
- status
- attempts
- started_at
- finished_at
- error_code/error_message
- metadata

Jobs should be safe to retry. Research and content operations must not create duplicate active records when the same idempotency key is retried.

## 11. Authorization

Server-side authorization is mandatory even when the UI filters records.

Recommended role set:
- OWNER
- ADMIN
- STRATEGIST
- EDITOR
- APPROVER
- CLIENT

Minimum rules:
- CLIENT sees only assigned client/brand resources.
- EDITOR can edit content but not publish.
- APPROVER can approve but not change tenant membership.
- ADMIN manages clients/brands/team.
- OWNER manages billing/integrations/tenant-wide settings.

Use Supabase RLS for defense in depth, plus application-level permission checks for business actions.

## 12. Observability

Every AI/research job emits structured events:
- request id
- organization id
- brand id
- job id
- provider
- model
- latency
- token usage if available
- retry count
- status
- error class

Do not log prompts/responses by default if they contain private client information; store only what is required for product functionality and auditability.

## 13. Production failure strategy

- API request validation errors => 400
- unauthenticated => 401
- unauthorized => 403
- missing resource => 404
- provider/configuration error => stable user-facing error + structured server log
- transient provider/network issue => bounded retry with jitter
- job failure => visible failed state + retry action
- partial crawl => complete with warning, never fabricate missing evidence

## 14. Testing strategy

### Unit
- URL validation and SSRF filters
- parsers
- chunking
- Brand Brain merge rules
- content-state transitions
- provider adapters with mocks

### Integration
- authenticated API routes
- RLS isolation
- research persistence
- AI generation persistence
- approval workflow

### E2E
Golden journey:
1. login
2. create client
3. add brand
4. analyze website
5. inspect evidence
6. inspect Brand Brain
7. generate strategy
8. generate content
9. edit/version content
10. request review
11. approve

## 15. Deployment environments

- local: `.env.local`
- preview: Vercel Preview environment
- production: Vercel Production environment

Secrets must exist only in environment/secret management systems.

## 16. Implementation sequence

1. Foundation + design system
2. Auth + tenant model + RLS
3. Clients + brands
4. Research ingestion pipeline
5. Brand Brain
6. Strategy
7. Content Studio + versioning
8. Approvals
9. AI Command Center
10. optional SEO/provider integrations
11. analytics/optimization
12. hardening + production verification
