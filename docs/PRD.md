# UpTrendifyOS — Product Requirements Document (PRD)

**Version:** 0.1  
**Status:** Approved foundation for implementation  
**Date:** 2026-09-16  
**Product:** UpTrendifyOS  
**Positioning:** AI-powered multi-brand marketing agency operating system

## 1. Executive Summary

UpTrendifyOS is a production-oriented, multi-tenant platform for agencies that manage marketing and growth operations for multiple clients/brands from one workspace.

A user onboards a brand by providing its company name and website URL. UpTrendifyOS researches permitted/public website content and other configured sources, normalizes the evidence, creates a structured Brand Brain, and uses that context to generate marketing strategy, SEO/content opportunities, campaign plans, and brand-specific content. Human users remain in control of approvals and publishing.

The product is intentionally not a simple blog generator. Its core loop is:

**Onboard → Research → Understand → Strategize → Generate → Review → Approve → Publish → Measure → Optimize.**

This direction is consistent with current public descriptions of Groovy Web's AI-first growth model, which describes coordinated agents across SEO, content, sales, competitive intelligence and analytics, and with current agency software patterns that separate agency and client workspaces. [Sources listed in section 18.]

## 2. Problem Statement

Marketing agencies operating multiple client brands must repeatedly collect website facts, understand positioning, research audiences and competitors, plan campaigns, create channel-specific content, coordinate approvals, and measure results. Generic AI tools lose brand context, while disconnected point solutions create operational overhead.

UpTrendifyOS should provide a single system of record for each brand while giving the agency a unified operational view.

## 3. Product Goals

### Primary goals
1. Support one agency managing multiple clients and brands.
2. Turn a company URL into a durable, source-backed Brand Brain.
3. Generate brand-specific marketing and SEO strategies rather than generic AI output.
4. Generate content across multiple formats and maintain content versions/status.
5. Support campaign planning and human approval workflows.
6. Provide source traceability for AI-derived insights.
7. Establish provider abstractions so AI/SEO vendors can be integrated or replaced without redesigning the product.
8. Be production-oriented: tenant isolation, authorization, auditability, observability, retries, rate limits, secure secrets and tested workflows.

### Secondary goals
1. Connect optional third-party providers such as Semrush, Surfer or Jasper where licensing/credentials are available.
2. Provide an AI command center for cross-module research and actions.
3. Support a future agent orchestration layer for research, SEO, strategy, content and analytics.

## 4. Non-Goals for V1

1. Fully autonomous publishing without human approval.
2. Replacing every CRM, ad platform, social scheduler or analytics provider.
3. Blind/unbounded web crawling.
4. Fabricating SEO metrics when external data providers are not configured.
5. Building every possible agency feature before the core URL-to-Brand-Brain workflow is stable.
6. Making the product dependent on any single vendor such as Jasper, GoHighLevel, Semrush or Surfer.

## 5. Target Users

### Agency Owner / Admin
Needs a portfolio-level view of clients, brands, campaigns, workload, AI activity and performance.

### Strategist / Marketing Manager
Needs research, insights, strategy generation, campaign plans and content recommendations.

### Content/SEO Specialist
Needs brand context, content briefs, keywords, content generation, optimization and review workflows.

### Editor / Approver
Needs to review, comment, approve or reject AI-generated assets.

### Client / Brand Stakeholder (future role)
Needs access only to assigned brand(s), campaign assets and approval tasks.

## 6. Core Product Model

```text
Organization
  ├── Users / Roles
  ├── Clients
  │    ├── Brands
  │    │    ├── Brand Sources
  │    │    ├── Brand Brain
  │    │    ├── Competitors
  │    │    ├── SEO Intelligence
  │    │    ├── Campaigns
  │    │    ├── Content
  │    │    └── Analytics
  │    └── Contacts / Stakeholders
  └── Agency-wide AI jobs / reporting
```

Every tenant-owned resource must be scoped to an organization and authorized before access.

## 7. Golden User Journey

### 7.1 Create client
Agency user creates a client record.

### 7.2 Add brand
User enters:
- Company/brand name
- Website URL
- Industry (optional)
- Market/country (optional)
- Audience (optional)
- Competitors (optional)
- Social URLs (optional)
- Brand guidelines/files (optional)

### 7.3 Analyze brand
The platform validates the URL, queues a research job, fetches permitted public pages, extracts readable content, records source URLs/timestamps, and creates structured intelligence.

### 7.4 Review Brand Brain
User reviews and edits the generated profile before treating it as authoritative working context.

### 7.5 Generate strategy
User selects goal + period + audience + channels. Strategy Agent generates a plan using current Brand Brain and available evidence.

### 7.6 Generate content
User creates a blog, LinkedIn post, email, landing page copy, ad copy, newsletter or content brief. The content generation layer must receive the relevant brand context, strategy and source evidence.

### 7.7 Review / approve
Asset enters a workflow: Draft → Internal Review → Client Review (optional) → Approved → Scheduled/Published.

### 7.8 Measure
Performance data can be connected later. The platform stores snapshots and recommendations without inventing unsupported metrics.

## 8. V1 Functional Requirements

### FR-01 Authentication and authorization
- Secure login.
- Organization membership.
- Role-based permissions.
- Resource-level authorization.
- No cross-client/brand data leakage.

### FR-02 Agency dashboard
Must show:
- active clients
- active brands
- campaigns
- content requiring review
- recent research/AI jobs
- high-priority opportunities
- recent errors

### FR-03 Client management
CRUD for clients with ownership/assignment information.

### FR-04 Brand management
CRUD for brands and brand settings.

### FR-05 Website research
- Validate and normalize URL.
- Respect crawling/robots/rate-limit rules and configured scope.
- Extract relevant public content.
- Store source URL, title, retrieval time, status and extracted content/metadata.
- Support refresh/re-analysis.
- Avoid duplicate source ingestion.

### FR-06 Brand Brain
The Brand Brain must store structured sections:
- company overview
- products/services
- value proposition
- audience/ICP
- personas
- customer problems
- buying triggers/objections
- positioning/differentiators
- tone/voice
- approved terminology
- CTAs
- markets
- competitors
- content pillars
- SEO opportunities
- evidence/source references

AI-generated facts must be distinguishable from user-confirmed facts.

### FR-07 Research evidence
Every research run must record:
- run ID
- brand ID
- source IDs
- timestamp
- extractor status
- AI model/provider used
- prompt/version metadata where appropriate
- output status
- error information

### FR-08 Competitor intelligence
V1 should support manually provided competitors and AI-suggested candidates. Third-party SEO/traffic data is optional and provider-dependent.

### FR-09 SEO intelligence
Provide internal opportunity analysis using available website content first. Add optional external provider adapters for Semrush/Surfer when configured.

### FR-10 Strategy generation
Generate a structured strategy with:
- goals
- target audience
- positioning
- content pillars
- channel recommendations
- campaign ideas
- SEO opportunities
- content roadmap
- KPIs
- assumptions/evidence

### FR-11 Content Studio
Support at least:
- blog/article
- LinkedIn/social post
- email
- landing page copy
- campaign brief
- content brief

Content must preserve brand context and allow user editing.

### FR-12 Content versioning
Every generated/edit version should be retained with author/source metadata.

### FR-13 Approval workflow
Content status states:
`DRAFT`, `IN_REVIEW`, `CLIENT_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`.

### FR-14 AI Command Center
Natural-language commands can retrieve permitted brand context and request actions. V1 must require explicit confirmation for consequential actions such as publishing or deleting.

### FR-15 AI provider abstraction
Implement a provider interface rather than hard-coding one vendor. Initial adapters may include Groq/OpenAI; additional providers can be added later.

### FR-16 Provider health
System must expose non-secret health/configuration state such as configured provider names, not credentials.

### FR-17 Observability
Capture structured logs for research runs, AI jobs, provider failures, retries and user-facing errors. Avoid logging secrets or sensitive payloads unnecessarily.

## 9. Optional Integrations

### Jasper
Use only as an optional content/brand-voice provider. Jasper's API is currently limited to Business plans, so it must not be a hard dependency.

### GoHighLevel
Use as an optional CRM/automation integration. UpTrendifyOS should keep its own client/brand model and provide an adapter rather than making GHL the source of truth.

### Semrush
Optional SEO/competitive data adapter. Semrush APIs currently expose domain, keyword, backlink, keyword-gap, Site Audit and related data, but API use requires the applicable paid plan/API units.

### Surfer
Optional content/SEO optimization adapter. Surfer's API currently supports audit/SERP data and newer Content Editor management/content scoring capabilities; use only when configured.

## 10. AI Agent Architecture

The first agent set:

```text
Research Agent
  ↓
Brand Intelligence Agent
  ↓
SEO Intelligence Agent
  ↓
Strategy Agent
  ↓
Content Agent
  ↓
Review/Compliance Agent
  ↓
Analytics/Optimization Agent
```

Agents do not directly mutate high-impact state without authorization. Agent actions should be auditable.

### Research Agent
Inputs: URL, scope, client/brand context.  
Outputs: evidence records and normalized page information.

### Brand Intelligence Agent
Inputs: evidence + user-provided facts.  
Outputs: Brand Brain candidates + confidence/evidence links.

### SEO Intelligence Agent
Inputs: website evidence + optional Semrush/Surfer data.  
Outputs: opportunities, content gaps, technical recommendations.

### Strategy Agent
Inputs: Brand Brain + goals + research + SEO data.  
Outputs: strategic roadmap.

### Content Agent
Inputs: Brand Brain + strategy + brief + evidence.  
Outputs: editable content draft.

### Review Agent
Inputs: draft + brand constraints + policy checks.  
Outputs: warnings/suggestions; it does not replace human approval.

## 11. Data Model

Core tables/entities:

```text
organizations
users
organization_members
clients
client_members
brands
brand_sources
brand_source_chunks
brand_profiles
brand_facts
brand_competitors
brand_keywords
brand_insights
research_runs
research_sources
agent_runs
agent_events
ai_tasks
strategies
campaigns
campaign_assets
content_items
content_versions
content_reviews
approvals
channels
integration_accounts
analytics_snapshots
notifications
audit_logs
```

All tables with tenant-owned data should carry `organization_id`. Brand-scoped tables should carry `brand_id` where appropriate. Use database policies/RLS where supported.

## 12. API Surface (V1)

```text
POST   /api/clients
GET    /api/clients
POST   /api/brands
GET    /api/brands/:id
PATCH  /api/brands/:id
DELETE /api/brands/:id

POST   /api/brands/:id/research
GET    /api/research/:runId
POST   /api/brands/:id/refresh

GET    /api/brands/:id/brain
PATCH  /api/brands/:id/brain

POST   /api/brands/:id/strategy
GET    /api/strategies/:id

POST   /api/brands/:id/content
GET    /api/brands/:id/content
GET    /api/content/:id
PATCH  /api/content/:id
POST   /api/content/:id/generate
POST   /api/content/:id/approve
POST   /api/content/:id/request-changes

POST   /api/ai/command
GET    /api/ai/providers

GET    /api/integrations
POST   /api/integrations/:provider/connect
DELETE /api/integrations/:provider
```

Exact routes may evolve during implementation.

## 13. Frontend Information Architecture

```text
/login
/dashboard
/clients
/clients/:id
/brands
/brands/new
/brands/:id/overview
/brands/:id/research
/brands/:id/brain
/brands/:id/seo
/brands/:id/strategy
/brands/:id/content
/brands/:id/campaigns
/brands/:id/analytics
/content/:id
/approvals
/ai
/settings
/settings/integrations
/settings/team
```

## 14. Design Direction

Product aesthetic:
- premium SaaS
- polished but restrained
- dark/light theme
- strong typography
- clean data visualization
- subtle glass/surface effects
- command palette
- contextual AI actions
- animated research progress
- clear empty/loading/error states
- responsive desktop-first dashboard

Avoid generic template/admin-dashboard appearance.

Key visual experience:
1. Brand onboarding should feel fast and intelligent.
2. Research progress should be understandable.
3. Brand Brain should be visually scannable.
4. Content generation should feel like an editor, not a chatbot.
5. Agency dashboard should communicate control across many brands.

## 15. Security and Compliance Requirements

- Never commit API keys.
- Use environment variables/secret manager.
- Validate and sanitize URLs.
- Restrict SSRF risks in URL fetching with allow/deny policies, DNS/IP validation and redirects controls.
- Respect robots/crawling rules where applicable.
- Apply request size and rate limits.
- Apply auth on all tenant APIs.
- Use parameterized database queries.
- Use RLS/authorization checks.
- Keep audit records for important mutations.
- Avoid logging tokens, credentials or unnecessary private client data.
- Require explicit confirmation for publishing/deleting/high-impact actions.

## 16. Reliability Requirements

- Background research jobs must be retryable/idempotent.
- Provider calls use bounded timeout + exponential backoff.
- Partial research must be represented honestly rather than silently fabricated.
- Long tasks show progress/status.
- Failed jobs can be retried.
- Database writes should be transactional where necessary.
- AI outputs must be versioned.

## 17. MVP Acceptance Criteria

A V1 demonstration is considered functional when a new agency user can:

1. Create a client.
2. Add a brand and URL.
3. Run website research.
4. See research sources/status.
5. Review a generated Brand Brain.
6. Generate a marketing strategy from that Brand Brain.
7. Generate at least one blog, social post and email draft using brand context.
8. Edit and version content.
9. Move content through review/approval states.
10. View an agency dashboard across multiple brands.
11. Run an AI command against a selected brand.
12. See errors and job states without exposing secrets.

## 18. External Product/Market Evidence

The product direction is informed by publicly documented capabilities and positioning:

- Groovy Web describes an AI-first growth model involving SEO, content, sales automation, growth strategy and multiple AI agents. Its published Growth OS case study describes 16 agents across 13 growth streams and an agent-log/CRM-backed operating system. This is directional evidence for the category, not a claim that this PRD reproduces Groovy's private systems.
- HighLevel documents an agency/sub-account model that separates agency and client workspaces and supports multi-client agency operations.
- Jasper documents Brand Voice and a Business-plan API for on-brand content generation.
- Semrush documents APIs for domain/keyword/backlink/competitor data and Site Audit, with paid-plan/API-unit requirements.
- Surfer documents Brand Knowledge and APIs for SEO/SERP/audit and Content Editor capabilities.

## 19. Success Metrics

V1 product metrics:
- time from brand URL submission to usable Brand Brain
- research success rate
- percentage of Brand Brain facts linked to evidence
- content generation completion rate
- content approval turnaround time
- AI job failure rate
- provider latency/error rate
- active brands per organization
- strategies/campaigns created

Do not use fabricated marketing performance metrics as product success evidence.

## 20. Delivery Plan

### Phase 0 — Foundation
- repository setup
- Next.js/TypeScript
- database
- auth
- design system
- environment/configuration
- CI

### Phase 1 — Multi-tenant agency core
- organizations
- users/roles
- clients
- brands
- dashboard

### Phase 2 — Brand Intelligence
- URL ingestion
- source store
- extraction
- research jobs
- Brand Brain

### Phase 3 — Growth Intelligence
- SEO opportunities
- competitor intelligence
- strategy generation

### Phase 4 — Content Operations
- content studio
- versioning
- approval workflow
- campaign assets

### Phase 5 — AI Command Center
- tool-using agent
- research/action tools
- audit logs
- confirmation gates

### Phase 6 — Provider integrations
- Semrush adapter
- Surfer adapter
- optional Jasper adapter
- optional GHL adapter

### Phase 7 — Production hardening
- security review
- tests
- load/error testing
- observability
- rate limits
- backups
- deployment

## 21. Architectural Principles

1. **Brand context is a first-class data model.**
2. **Evidence before inference.**
3. **Human approval for consequential actions.**
4. **Provider-agnostic architecture.**
5. **Multi-tenant isolation from day one.**
6. **Every long-running AI/research operation is observable and retryable.**
7. **No silent hallucinated metrics.**
8. **Build a useful core before adding vendor integrations.**
9. **Every generated asset belongs to a brand and campaign context.**
10. **The product should remain usable even without paid third-party APIs.**

## 22. V1 Definition of Done

The V1 is ready for senior demonstration when:

- the app can be installed and run from documented commands;
- authentication and tenant isolation are operational;
- multiple brands can be created under one agency;
- URL research creates persisted source-backed brand intelligence;
- Brand Brain can be reviewed/edited;
- strategy and content generation use the selected brand context;
- content review/approval works;
- AI failures are visible and recoverable;
- no secret is present in the repository;
- core API and UI paths have automated tests;
- a production deployment is available;
- monitoring/logging is available for critical background/AI jobs;
- the complete golden user journey has been manually tested.
