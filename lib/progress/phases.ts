export type PhaseStatus = 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';

export type ProjectPhase = {
  phase: number;
  title: string;
  description: string;
  status: PhaseStatus;
  evidence: string[];
};

export const PROJECT_PHASES: readonly ProjectPhase[] = [
  {
    phase: 1,
    title: 'Foundation — Agency Architecture',
    description: 'Repository, database schema, RLS tenant isolation, environment system and the agency command-center design shell.',
    status: 'COMPLETED',
    evidence: [
      'Next.js 16 + TypeScript + Supabase monorepo with Zod-validated env',
      '0001–0007 migrations: organizations, organizations/clients/brands, tenant RLS',
      'Design system (shell, globals.css, brand overview)',
    ],
  },
  {
    phase: 2,
    title: 'Authentication & RBAC',
    description: 'Email/password sign-in, session handling and role-based authorization scoped to each organization.',
    status: 'COMPLETED',
    evidence: ['Supabase Auth email/password sessions', 'Role model (OWNER/ADMIN/STRATEGIST/EDITOR/VIEWER) with route + action guards'],
  },
  {
    phase: 3,
    title: 'Client & Brand Management',
    description: 'Agency clients and the brands under them, each with its own website URL, slug and tenant isolation.',
    status: 'COMPLETED',
    evidence: ['Client entities + brand records with website_url', 'Organization-scoped CRUD and membership checks'],
  },
  {
    phase: 4,
    title: 'Website Research & Evidence',
    description: 'Bounded, SSRF-guarded website crawling that stores canonical sources, evidence and research-run lifecycle.',
    status: 'COMPLETED',
    evidence: [
      'POST /api/brands/[brandId]/research (idempotent, 409 while active)',
      'brand_sources + research_runs + ai_tasks, COMPLETED/PARTIAL/FAILED states',
    ],
  },
  {
    phase: 5,
    title: 'Brand Intelligence — Brand Brain',
    description: 'Extraction of facts, insights and source-backed suggestions from the evidence gathered during research.',
    status: 'COMPLETED',
    evidence: ['brand_facts / brand_insights / brand_suggestions', 'Evidence strength, confidence and cited sources'],
  },
  {
    phase: 6,
    title: 'Brand Brain — Review & Approval',
    description: 'Human-in-the-loop review, edit, regenerate and the approval gate that unlocks strategy.',
    status: 'COMPLETED',
    evidence: ['Review actions: approve / edit / reject / regenerate', 'Gate: 4 approved (incl. brand_name) required before strategy'],
  },
  {
    phase: 7,
    title: 'Strategy Engine',
    description: 'Schema-validated 14-section strategy generation versioned per brand, persisted with ai_tasks linkage.',
    status: 'COMPLETED',
    evidence: ['strategies + versioning + StrategyOutput schema', 'SUCCEEDED/FAILED with error_code/error_message'],
  },
  {
    phase: 8,
    title: 'AI Reliability — Retry & Failure Classification',
    description: 'Deterministic provider-failure classification, bounded validation retries and non-commit of invalid AI output.',
    status: 'COMPLETED',
    evidence: ['Provider failure taxonomy + retry with back-off', 'Invalid output is never persisted as SUCCEEDED'],
  },
  {
    phase: 9,
    title: 'Presentation Replay Mode',
    description: 'Deterministic, model-free replay for demos: seeded workspace replays the full flow without any live AI call.',
    status: 'COMPLETED',
    evidence: [
      'lib/replay/ + fixtures + seed-presentation.cjs',
      'AI_EXECUTION_MODE=replay: Research → Brain → Review → Strategy',
    ],
  },
  {
    phase: 10,
    title: 'Content Studio',
    description: 'Brand-directed content creation for ads, social and web using the approved Brand Brain and strategy.',
    status: 'COMPLETED',
    evidence: [
      '0008 migration: content_items intent fields, versioned content_versions, content_reviews, REJECTED status',
      'content_generation pipeline grounded in approved Brand Brain + latest strategy, with ai_tasks traceability',
      'Review state machine (submit → IN_REVIEW → approve/reject/…) + replay content generation',
    ],
  },
  {
    phase: 11,
    title: 'Campaign Management',
    description: 'Campaigns built from approved strategy pillars with budget, channels and publish workflow.',
    status: 'IN_PROGRESS',
    evidence: [
      '0025_campaign_management.sql: campaign_status lifecycle (DRAFT→PLANNED→ACTIVE→COMPLETED/ARCHIVED) with client attribution, budget/currency/dates/channels, transition + lineage triggers (strategy must be SUCCEEDED, client matches brand)',
      'REST API: GET/POST /api/brands/[brandId]/campaigns, GET/PATCH …/campaigns/[campaignId], POST …/status — RBAC (CAN_MANAGE/CAN_VIEW_CAMPAIGNS), tenant isolation and approved-strategy grounding',
      'Campaign UI: organization-wide /campaigns hub grouped by client → brand, brand campaign workspace (list + create + strategy gate), campaign detail (edit, lifecycle actions, budget/dates/channels, related content)',
      'Content Studio linkage: content briefs can be linked to a campaign (campaign_id); the campaign detail lists its related content',
      'Verification: npm test passing, typecheck and build clean; 0025_campaign_management.sql applied to the local Supabase database and lifecycle/lineage triggers verified at the SQL level. Pending: manual end-to-end verification of the deployed campaign workflow before this phase can close.',
    ],
  },
  {
    phase: 12,
    title: 'Approval & Publishing',
    description: 'Content review/approval and controlled publishing to connected channels.',
    status: 'IN_PROGRESS',
    evidence: [
      '0026_approval_publishing.sql: publication_status + channel_connection_status enums, READY_TO_PUBLISH content status, channel_configurations and content_publications tables with tenant RLS, idempotency key uniqueness, and append-only publication ledger',
      'DB guardrails: content_reviews is the version-exact approval ledger; the invalidate_approval_on_version_change trigger resets an approved/queued/published item to DRAFT whenever its current_version_id changes; PUBLISHED requires publisher role + SUCCEEDED publication evidence',
      'Approval state machine: submit → IN_REVIEW → approve → APPROVED → queue_for_publish → READY_TO_PUBLISH → publish; back_to_approved undo, request changes, reject, return to draft, archive',
      'Honest publishing core: lib/publish/{schema,connectors,service}.ts — no fabricated connectors; an unconfigured/unregistered channel records a NOT_CONNECTED attempt and leaves the item queued; success records evidence + flips status',
      'API: POST/GET /api/brands/[brandId]/content/[contentId]/publish (idempotency, duplicate-safety, republish) and GET /api/approvals (filterable org-wide queue with version preview + decision history and canApprove/canPublish)',
      'UI: /approvals org-wide queue with filters and role-gated approve/reject/request-changes/queue/publish actions; content detail publish controls; shell Approvals navigation',
      'Access control: CAN_PUBLISH_CONTENT (OWNER/ADMIN/STRATEGIST) added alongside existing review/viewer roles',
      'Fixed during verification: the 0026 helper functions are SECURITY INVOKER, so the API role must be able to run them. Added PRIVILEGE grants (schema private USAGE + EXECUTE on the four guard functions) to the migration — without them every status-changing write failed with 42501 (permission denied for schema private)',
      'Verification: npm test 396 passing, typecheck and build clean. HTTP-flown manual E2E against the local app verified: DRAFT→submit→IN_REVIEW→approve→APPROVED (reviews pin current_version_id)→queue_for_publish→READY_TO_PUBLISH visible in /api/approvals (brand/campaign/client, type, status, version preview, decision history)→publish records a NOT_CONNECTED attempt (initiated_by set, item stays queued)→idempotency key dedupes to one row→back_to_approved→PATCH version bump invalidates to DRAFT with a new version→publish/approve as EDITOR returns 403→cross-tenant access returns 404→campaign detail surfaces content status. Still pending final product verification (a channel connector or a real connected channel) before this phase can close.',
    ],
  },
  {
    phase: 13,
    title: 'Analytics & Learning Loop',
    description: 'Performance measurement of published work feeding back into the Brand Brain and strategy.',
    status: 'PENDING',
    evidence: [],
  },
];

const COMPLETED_PHASES = PROJECT_PHASES.filter((phase) => phase.status === 'COMPLETED');
const IN_PROGRESS_PHASES = PROJECT_PHASES.filter((phase) => phase.status === 'IN_PROGRESS');

export function progressStats() {
  const total = PROJECT_PHASES.length;
  const completed = COMPLETED_PHASES.length;
  const inProgress = IN_PROGRESS_PHASES.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, inProgress, pending: total - completed - inProgress, percent };
}
