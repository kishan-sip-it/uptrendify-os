export type DfdLevel = 0 | 1 | 2;
export type DfdNodeKind = 'external' | 'process' | 'store' | 'system';
export type DfdNode = {
  id: string;
  label: string;
  subtitle: string;
  kind: DfdNodeKind;
  position: [number, number, number];
  detail: string;
};
export type DfdEdge = {
  from: string;
  to: string;
  label: string;
  bend?: number;
};
export type DfdDiagram = {
  level: DfdLevel;
  title: string;
  description: string;
  scope: string;
  nodes: DfdNode[];
  edges: DfdEdge[];
};

export const DFD_LEVELS: Record<DfdLevel, DfdDiagram> = {
  0: {
    level: 0,
    title: 'Platform overview',
    description: 'The people, public sources, AI services and saved workspace data around the application workflow.',
    scope: 'Platform inputs · services · saved results',
    nodes: [
      { id: 'agency', label: 'Agency team', subtitle: 'People', kind: 'external', position: [-7.4, 0, 0], detail: 'Agency users create client brands, request research, review suggested facts, approve decisions and request strategies or content.' },
      { id: 'platform', label: 'UpTrendifyOS', subtitle: 'Core platform', kind: 'system', position: [0, 0, 0], detail: 'The platform validates requests, scans public websites, runs research, prepares Brand Brain suggestions and generates downstream strategy and campaign work.' },
      { id: 'website', label: 'Client websites', subtitle: 'First-party public pages', kind: 'external', position: [-0.3, 4.1, 0], detail: 'Public pages provide HTML, metadata, structured data, visible copy, stylesheets, images, logos, favicons and manifests. A blocked or unavailable site may limit what can be learned.' },
      { id: 'ai', label: 'AI providers', subtitle: 'Enrichment / generation', kind: 'external', position: [7.3, 2.1, 0], detail: 'Configured model providers receive bounded evidence and prompts and return structured brand intelligence, suggestions or generated strategy. Outputs still need validation.' },
      { id: 'reader', label: 'Search / reader services', subtitle: 'Public web recovery', kind: 'external', position: [7.2, -2.1, 0], detail: 'Configured external search or rendered-reader services can add public sources or recover readable text when direct website fetching is blocked or incomplete.' },
      { id: 'database', label: 'Supabase', subtitle: 'Managed persistence', kind: 'store', position: [-0.2, -4.2, 0], detail: 'The managed data layer stores workspace and brand records, visual identity, research runs and sources, suggestions and decisions, strategy versions, content and campaign records.' },
    ],
    edges: [
      { from: 'agency', to: 'platform', label: 'Requests / edits', bend: -0.18 },
      { from: 'platform', to: 'agency', label: 'Profiles / results', bend: 0.18 },
      { from: 'website', to: 'platform', label: 'Pages / assets', bend: 0.28 },
      { from: 'platform', to: 'website', label: 'Safe public fetches', bend: -0.28 },
      { from: 'platform', to: 'ai', label: 'Evidence / prompts', bend: 0.28 },
      { from: 'ai', to: 'platform', label: 'Structured outputs', bend: -0.28 },
      { from: 'platform', to: 'reader', label: 'Reader / search calls', bend: -0.26 },
      { from: 'reader', to: 'platform', label: 'Public text / sources', bend: 0.26 },
      { from: 'platform', to: 'database', label: 'Persist changes', bend: 0.25 },
      { from: 'database', to: 'platform', label: 'Saved context', bend: -0.25 },
    ],
  },
  1: {
    level: 1,
    title: 'End-to-end workflow',
    description: 'The real product journey from brand setup and website scanning through research, human review, strategy and delivery.',
    scope: 'Brand setup · evidence · decisions · deliverables',
    nodes: [
      { id: 'user', label: 'Agency team', subtitle: 'External entity', kind: 'external', position: [-8.0, 0.0, 0], detail: 'Starts work, supplies a public website, reviews research and suggestions, approves facts and requests downstream output.' },
      { id: 'site', label: 'Client website', subtitle: 'First-party source', kind: 'external', position: [-8.0, 3.8, 0], detail: 'The source of public pages and public brand assets. Fetches are bounded and should not be treated as successful when they return a security interstitial.' },
      { id: 'reader', label: 'Search / reader', subtitle: 'Fallback source', kind: 'external', position: [-8.0, -3.8, 0], detail: 'Optional public search and rendered-reader inputs help widen source coverage or recover content that direct HTML fetching cannot read.' },
      { id: 'setup', label: 'Workspace & brand setup', subtitle: 'P1 · scope / access', kind: 'process', position: [-4.8, 2.0, 0], detail: 'Authenticates and scopes work to an organization, establishes brand records and keeps operations attached to the correct brand/workspace.' },
      { id: 'brandStore', label: 'Brand records', subtitle: 'D1 · identity', kind: 'store', position: [-4.8, -1.25, 0], detail: 'Stores the brand website URL, user-reviewed brand fields and visual identity. Repeat scans should merge new evidence rather than clear useful saved values.' },
      { id: 'scanner', label: 'Website identity scanner', subtitle: 'P2 · visual extraction', kind: 'process', position: [-1.45, 3.0, 0], detail: 'Validates public URLs; gathers HTML, stylesheets and bounded public assets; deterministically extracts logo candidates, palette, fonts and metadata; then enriches supported fields.' },
      { id: 'crawler', label: 'Research crawler', subtitle: 'P3 · source capture', kind: 'process', position: [-1.45, 0.0, 0], detail: 'Discovers and fetches relevant public pages, rejects error/interstitial pages, extracts content, records source status and reuses the last successful capture on transient refresh failures.' },
      { id: 'sourceStore', label: 'Sources & research runs', subtitle: 'D2 · evidence', kind: 'store', position: [-1.45, -3.2, 0], detail: 'Persists research runs, source links, canonical URLs, extracted text, provenance, status and bounded failure metadata for later analysis.' },
      { id: 'brain', label: 'Brand Brain', subtitle: 'P4 · evidence → suggestions', kind: 'process', position: [2.2, 2.15, 0], detail: 'Combines first-party and saved research evidence into structured suggestions. Suggestions are not authoritative until the human review/approval flow decides them.' },
      { id: 'suggestionStore', label: 'Suggestions & approved facts', subtitle: 'D3 · review state', kind: 'store', position: [2.2, -0.85, 0], detail: 'Stores proposed claims, source evidence and review decisions. Approved facts provide the trusted context for strategy generation.' },
      { id: 'strategy', label: 'Strategy engine', subtitle: 'P5 · versioned plan', kind: 'process', position: [5.6, 1.15, 0], detail: 'Uses the brand context and approved facts to generate and save versioned strategies; generation remains grounded in the specific brand’s evidence.' },
      { id: 'delivery', label: 'Content / campaigns / approvals', subtitle: 'P6 · execution', kind: 'process', position: [5.6, -2.35, 0], detail: 'Downstream execution stores campaign and content records, exact versions and approval decisions in their brand and campaign context.' },
      { id: 'outputStore', label: 'Strategies & deliverables', subtitle: 'D4 · saved outputs', kind: 'store', position: [8.0, -3.8, 0], detail: 'Persists strategy versions and their linked downstream campaign/content deliverables and lifecycle decisions.' },
      { id: 'ai', label: 'AI providers', subtitle: 'External model APIs', kind: 'external', position: [8.0, 3.1, 0], detail: 'Configured models enrich evidence and generate suggestions/strategy. Failures, malformed responses and rate limits must be handled explicitly rather than silently claiming success.' },
    ],
    edges: [
      { from: 'user', to: 'setup', label: 'Brand details', bend: 0.24 },
      { from: 'setup', to: 'brandStore', label: 'Create / update', bend: 0.18 },
      { from: 'brandStore', to: 'scanner', label: 'Website URL', bend: -0.25 },
      { from: 'site', to: 'scanner', label: 'HTML / assets', bend: 0.2 },
      { from: 'scanner', to: 'site', label: 'Public requests', bend: -0.2 },
      { from: 'scanner', to: 'ai', label: 'Evidence context', bend: 0.2 },
      { from: 'ai', to: 'scanner', label: 'Brand fields', bend: -0.2 },
      { from: 'scanner', to: 'brandStore', label: 'Visual identity', bend: 0.24 },
      { from: 'user', to: 'crawler', label: 'Research request', bend: -0.1 },
      { from: 'crawler', to: 'site', label: 'Page requests', bend: -0.22 },
      { from: 'site', to: 'crawler', label: 'Page content', bend: 0.22 },
      { from: 'crawler', to: 'reader', label: 'Fallback lookup', bend: 0.18 },
      { from: 'reader', to: 'crawler', label: 'Public sources', bend: -0.18 },
      { from: 'crawler', to: 'sourceStore', label: 'Extracted evidence', bend: 0.2 },
      { from: 'sourceStore', to: 'brain', label: 'Saved sources', bend: -0.28 },
      { from: 'user', to: 'brain', label: 'Review / decisions', bend: 0.2 },
      { from: 'brain', to: 'ai', label: 'Evidence prompt', bend: -0.18 },
      { from: 'ai', to: 'brain', label: 'Suggestions', bend: 0.18 },
      { from: 'brain', to: 'suggestionStore', label: 'Proposals / review', bend: 0.18 },
      { from: 'suggestionStore', to: 'strategy', label: 'Approved facts', bend: 0.2 },
      { from: 'strategy', to: 'ai', label: 'Strategy context', bend: 0.18 },
      { from: 'ai', to: 'strategy', label: 'Strategy output', bend: -0.18 },
      { from: 'strategy', to: 'outputStore', label: 'Versioned plan', bend: -0.18 },
      { from: 'outputStore', to: 'delivery', label: 'Approved context', bend: 0.18 },
      { from: 'delivery', to: 'user', label: 'Review / approval', bend: 0.25 },
      { from: 'delivery', to: 'outputStore', label: 'Saved deliverables', bend: -0.2 },
    ],
  },
  2: {
    level: 2,
    title: 'Website scan detail',
    description: 'How the website scanner validates a public URL, reads page evidence, ranks visual identity, enriches supported fields and saves results without discarding useful existing data.',
    scope: 'Safe URL · retrieval · extraction · validation · merge',
    nodes: [
      { id: 'requester', label: 'Brand intake', subtitle: 'Input URL', kind: 'external', position: [-8.0, 0.0, 0], detail: 'Receives the website URL for a brand. The scan should be explicit when fields could not be observed, instead of fabricating identity values.' },
      { id: 'validate', label: 'Validate URL', subtitle: 'P2.1 · SSRF / redirects', kind: 'process', position: [-5.1, 0.0, 0], detail: 'Normalizes the public URL, applies protocol/host/IP and redirect safety policy, and rejects unsafe internal destinations before outbound requests.' },
      { id: 'fetch', label: 'Fetch source HTML', subtitle: 'P2.2 · bounded request', kind: 'process', position: [-2.2, 0.0, 0], detail: 'Makes a bounded homepage/public-page request and detects obvious blocked pages, invalid content types and unreadable responses.' },
      { id: 'website', label: 'Public site', subtitle: 'HTML / metadata', kind: 'external', position: [-2.2, 4.15, 0], detail: 'Returns page HTML, meta tags, JSON-LD, links and visible content. This data is untrusted source evidence, never executable instructions.' },
      { id: 'dom', label: 'Parse DOM evidence', subtitle: 'P2.3 · name / logo / copy', kind: 'process', position: [0.75, 2.45, 0], detail: 'Extracts title, description, organization metadata and header-linked logo candidates. It scores full wordmarks above generic share images when the evidence supports it.' },
      { id: 'assets', label: 'Inspect styles & assets', subtitle: 'P2.4 · CSS / SVG / icons', kind: 'process', position: [0.75, -1.5, 0], detail: 'Fetches a bounded number of first-party stylesheets and public assets. It inspects CSS declarations, SVG colours, manifests, favicons, raster colours and declared typography.' },
      { id: 'resources', label: 'Website assets', subtitle: 'CSS / images / icons', kind: 'external', position: [0.75, -4.25, 0], detail: 'The public site or approved asset CDN serves linked stylesheets, logos, favicons and other bounded image assets. Optional asset failure should not erase good HTML evidence.' },
      { id: 'reader', label: 'Rendered reader', subtitle: 'Fallback recovery', kind: 'external', position: [4.0, -4.25, 0], detail: 'A bounded public reader may supply usable rendered text if direct retrieval is blocked or incomplete. Reader error pages are rejected as content.' },
      { id: 'visual', label: 'Rank visual evidence', subtitle: 'P2.5 · logo / colour / fonts', kind: 'process', position: [3.9, 2.25, 0], detail: 'Combines independent evidence and ranks candidate logos, primary/secondary palette roles and declared fonts. It should reject unrelated partner/customer logos and avoid unsupported confidence.' },
      { id: 'ai', label: 'AI provider', subtitle: 'Structured enrichment', kind: 'external', position: [7.6, 3.2, 0], detail: 'Receives bounded public evidence and a constrained schema; returns supported products, services, audience, positioning, messaging and SEO fields. Missing evidence stays missing.' },
      { id: 'enrich', label: 'Enrich & validate', subtitle: 'P2.6 · schema output', kind: 'process', position: [6.6, 0.15, 0], detail: 'Uses the configured provider path with a bounded time budget. Structured fields are mapped and validated; AI absence must not erase deterministic logo/colour evidence.' },
      { id: 'merge', label: 'Merge scan results', subtitle: 'P2.7 · preserve known data', kind: 'process', position: [6.6, -2.15, 0], detail: 'Combines deterministic, CSS, manifest and AI evidence. For a repeat scan, empty values do not replace existing identity, and new evidence is added without discarding human edits.' },
      { id: 'store', label: 'Brand identity', subtitle: 'D1 · Supabase', kind: 'store', position: [8.2, -4.35, 0], detail: 'Persists the merged visual identity and structured brand fields. The stored logo URL must survive mapping into the Brand Profile/preview.' },
    ],
    edges: [
      { from: 'requester', to: 'validate', label: 'Website URL', bend: 0.16 },
      { from: 'validate', to: 'fetch', label: 'Safe normalized URL', bend: 0.16 },
      { from: 'fetch', to: 'website', label: 'HTTP request', bend: 0.2 },
      { from: 'website', to: 'fetch', label: 'HTML / headers', bend: -0.2 },
      { from: 'fetch', to: 'dom', label: 'HTML document', bend: 0.18 },
      { from: 'dom', to: 'assets', label: 'Linked assets', bend: 0.2 },
      { from: 'assets', to: 'resources', label: 'CSS / asset fetch', bend: -0.2 },
      { from: 'resources', to: 'assets', label: 'Files / declarations', bend: 0.2 },
      { from: 'fetch', to: 'reader', label: 'Fallback when blocked', bend: -0.22 },
      { from: 'reader', to: 'dom', label: 'Rendered text', bend: 0.18 },
      { from: 'dom', to: 'visual', label: 'DOM candidates', bend: -0.16 },
      { from: 'assets', to: 'visual', label: 'CSS / image evidence', bend: 0.2 },
      { from: 'visual', to: 'enrich', label: 'Deterministic identity', bend: 0.18 },
      { from: 'visual', to: 'ai', label: 'Evidence / prompt', bend: 0.16 },
      { from: 'ai', to: 'enrich', label: 'Structured fields', bend: -0.16 },
      { from: 'enrich', to: 'merge', label: 'Validated scan payload', bend: 0.12 },
      { from: 'merge', to: 'store', label: 'Additive identity write', bend: -0.2 },
    ],
  },
};