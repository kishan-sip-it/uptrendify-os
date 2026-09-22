import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const STAGES = [
  { key: 'research', label: 'Research', description: 'Discover what the business actually does.' },
  { key: 'brand_brain', label: 'Brand Intelligence', description: 'Review what AI discovered from the evidence.' },
  { key: 'strategy', label: 'Strategy', description: 'Turn verified intelligence into a marketing plan.' },
  { key: 'content', label: 'Content Studio', description: 'Create the assets you may actually publish.' },
  { key: 'campaigns', label: 'Campaigns', description: 'Organize content around marketing initiatives.' },
  { key: 'approval', label: 'Content Approval', description: 'Approve the exact content version.' },
  { key: 'publishing', label: 'Publishing', description: 'Send approved content to connected channels.' },
] as const;

export async function GET(request: Request) {
  try {
    const auth = await requireOrgRole(CAN_VIEW_DASHBOARD);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });

    const supabase = await createSupabaseServerClient();
    const url = new URL(request.url);
    const requestedBrandId = url.searchParams.get('brandId');

    const brandsResult = await supabase
      .from('brands')
      .select('id,name,status')
      .eq('organization_id', auth.context.organizationId)
      .neq('status', 'ARCHIVED')
      .order('created_at', { ascending: true })
      .limit(50);
    if (brandsResult.error) throw brandsResult.error;

    const brands = brandsResult.data ?? [];
    if (brands.length === 0) {
      return NextResponse.json({
        ok: true,
        stages: STAGES.map((stage, index) => ({ ...stage, status: index === 0 ? 'CURRENT' : 'UPCOMING' })),
        currentKey: 'research',
        currentBrandId: null,
        nextAction: 'Create your first brand',
        nextHref: '/brands/new',
        message: 'Add a brand so UpTrendifyOS can research it.',
        blocker: null,
        progressPercent: 0,
      });
    }

    const currentBrand = (requestedBrandId && brands.find((brand) => brand.id === requestedBrandId)) || brands[0];
    const brandId = currentBrand.id;

    const [runs, suggestions, strategies, content, campaigns] = await Promise.all([
      supabase
        .from('research_runs')
        .select('id,brand_id,status,created_at,error_code,error_message')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('brand_suggestions')
        .select('id,brand_id,field,status')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('strategies')
        .select('id,brand_id,status,created_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('content_items')
        .select('id,brand_id,status,created_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('campaigns')
        .select('id,brand_id,status,created_at')
        .eq('brand_id', brandId)
        .eq('organization_id', auth.context.organizationId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (runs.error) throw runs.error;
    if (suggestions.error) throw suggestions.error;
    if (strategies.error) throw strategies.error;
    if (content.error) throw content.error;
    if (campaigns.error) throw campaigns.error;

    const runRows = runs.data ?? [];
    const suggestionRows = suggestions.data ?? [];
    const contentRows = content.data ?? [];
    const campaignRows = campaigns.data ?? [];
    const gateFields = new Set(
      suggestionRows
        .filter((suggestion) => suggestion.status === 'APPROVED' || suggestion.status === 'EDITED')
        .map((suggestion) => suggestion.field),
    );
    const gatePassed = gateFields.size >= 4 && gateFields.has('brand_name');
    const activeResearch = runRows.find((run) => run.status === 'QUEUED' || run.status === 'RUNNING');
    const latestResearch = runRows[0] ?? null;
    const researchDone = runRows.some((run) => run.status === 'COMPLETED' || run.status === 'PARTIAL');
    const latestStrategy = (strategies.data ?? []).find((strategy) => strategy.status === 'SUCCEEDED');
    const reviewableContent = contentRows.some((item) => ['IN_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'READY_TO_PUBLISH'].includes(item.status));
    const readyToPublish = contentRows.some((item) => item.status === 'READY_TO_PUBLISH');

    let currentKey: (typeof STAGES)[number]['key'] = 'research';
    let nextAction = 'Start research';
    let blocker: string | null = null;
    let message: string | null = null;

    if (activeResearch) {
      currentKey = 'research';
      nextAction = 'Let research finish';
      message = 'The research job is running in the background. You can leave this page and come back.';
    } else if (!researchDone) {
      currentKey = 'research';
      nextAction = 'Start research';
      message = 'Start with your brand website. UpTrendifyOS will collect evidence before asking you to review anything.';
    } else if (!gatePassed) {
      currentKey = 'brand_brain';
      nextAction = 'Review Brand Intelligence';
      message = String(suggestionRows.filter((suggestion) => suggestion.status === 'PENDING').length) + ' suggestion(s) still need a human decision.';
    } else if (!latestStrategy) {
      currentKey = 'strategy';
      nextAction = 'Generate strategy';
      message = 'Your Brand Brain gate is satisfied. Strategy can now be generated from verified intelligence.';
    } else if (contentRows.length === 0) {
      currentKey = 'content';
      nextAction = 'Create your first content';
      message = 'Turn the approved strategy into a concrete content asset.';
    } else if (campaignRows.length === 0) {
      currentKey = 'campaigns';
      nextAction = 'Create a campaign';
      message = 'Group your content around a marketing initiative, audience, channels, dates and budget.';
    } else if (readyToPublish) {
      currentKey = 'publishing';
      nextAction = 'Publish approved content';
      message = 'Approved content is ready for a connected external channel.';
    } else if (reviewableContent) {
      currentKey = 'approval';
      nextAction = 'Review content awaiting approval';
      message = 'Review the exact content version before it can move toward publishing.';
    } else {
      currentKey = 'campaigns';
      nextAction = 'Review campaigns';
      message = 'Your campaigns are set up. Add or organize content around the initiatives that matter.';
    }

    if (latestResearch?.status === 'PARTIAL' && currentKey !== 'research') {
      blocker = latestResearch.error_message || 'Research completed with partial source coverage. Review the source statuses before relying on every field.';
    }

    const currentIndex = STAGES.findIndex((stage) => stage.key === currentKey);
    const nextHref = currentKey === 'research'
      ? '/brands/' + brandId
      : currentKey === 'brand_brain'
        ? '/brands/' + brandId + '#intelligence'
        : currentKey === 'strategy'
          ? '/brands/' + brandId + '#strategy'
          : currentKey === 'content'
            ? '/brands/' + brandId + '/content'
            : currentKey === 'campaigns'
              ? '/brands/' + brandId + '/campaigns'
              : currentKey === 'approval'
                ? '/approvals'
                : '/approvals?status=READY_TO_PUBLISH';

    const stageState = STAGES.map((stage, index) => ({
      ...stage,
      status: index < currentIndex ? 'COMPLETED' : index === currentIndex ? 'CURRENT' : 'UPCOMING',
    }));

    return NextResponse.json({
      ok: true,
      stages: stageState,
      currentKey,
      currentBrandId: brandId,
      currentBrandName: currentBrand.name,
      nextAction,
      nextHref,
      blocker,
      message,
      progressPercent: Math.round((Math.max(0, currentIndex) / (STAGES.length - 1)) * 100),
    });
  } catch (error) {
    obs.error('Workflow state load failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Could not load workflow state' }, { status: 500 });
  }
}
