import { redirect } from 'next/navigation';
import { ArrowUpRight, Boxes, CalendarDays, Plus } from 'lucide-react';
import { CAN_VIEW_CAMPAIGNS, requireOrgRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_LABELS } from '@/lib/campaign/schema';

export const dynamic = 'force-dynamic';

type BrandRow = { id: string; name: string; status: string | null; client_id: string | null };
type CampaignRow = {
  id: string;
  name: string;
  status: string;
  currency: string;
  budget: number | null;
  channels: string[] | null;
  start_date: string | null;
  end_date: string | null;
  client_id: string | null;
  brand_id: string | null;
  created_at: string;
  updated_at: string;
};

function statusTone(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'tone-good';
    case 'DRAFT':
      return 'tone-info';
    case 'ARCHIVED':
      return 'tone-muted';
    case 'COMPLETED':
      return 'tone-warn';
    default:
      return 'tone-info';
  }
}

function formatBudget(campaign: CampaignRow): string {
  if (campaign.budget == null) return 'No budget set';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: campaign.currency || 'USD', maximumFractionDigits: 0 }).format(campaign.budget);
  } catch {
    return `${campaign.currency || 'USD'} ${campaign.budget}`;
  }
}

function formatDates(campaign: CampaignRow): string | null {
  if (!campaign.start_date && !campaign.end_date) return null;
  if (campaign.start_date && campaign.end_date) return `${campaign.start_date} → ${campaign.end_date}`;
  return campaign.start_date ?? `ends ${campaign.end_date}`;
}

function channelSummary(campaign: CampaignRow): string {
  const channels = campaign.channels ?? [];
  if (channels.length === 0) return 'No channels selected';
  const labels = channels.slice(0, 4).map((channel) => CAMPAIGN_CHANNEL_LABELS[channel] ?? channel);
  const extra = channels.length > 4 ? ` +${channels.length - 4} more` : '';
  return labels.join(', ') + extra;
}

export default async function CampaignsHubPage() {
  const auth = await requireOrgRole(CAN_VIEW_CAMPAIGNS);
  if (auth.error) redirect('/login');

  const supabase = await createSupabaseServerClient();
  const [clientsResult, brandsResult, campaignsResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id,name')
      .eq('organization_id', auth.context.organizationId)
      .order('name', { ascending: true }),
    supabase
      .from('brands')
      .select('id,name,status,client_id')
      .eq('organization_id', auth.context.organizationId)
      .order('name', { ascending: true }),
    supabase
      .from('campaigns')
      .select('id,name,status,currency,budget,channels,start_date,end_date,client_id,brand_id,created_at,updated_at')
      .eq('organization_id', auth.context.organizationId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (brandsResult.error) throw brandsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;

  const clients = clientsResult.data ?? [];
  const brands = (brandsResult.data ?? []) as BrandRow[];
  const campaigns = (campaignsResult.data ?? []) as CampaignRow[];

  if (brands.length === 0) redirect('/brands/new');

  const clientName = new Map<string, string>();
  for (const client of clients) clientName.set(client.id, client.name);

  const brandsByClient = new Map<string | null, BrandRow[]>();
  const campaignsByBrand = new Map<string, CampaignRow[]>();
  for (const brand of brands) {
    const bucket = brandsByClient.get(brand.client_id) ?? [];
    bucket.push(brand);
    brandsByClient.set(brand.client_id, bucket);
  }
  for (const campaign of campaigns) {
    if (!campaign.brand_id) continue;
    const bucket = campaignsByBrand.get(campaign.brand_id) ?? [];
    bucket.push(campaign);
    campaignsByBrand.set(campaign.brand_id, bucket);
  }

  const clientSections = Array.from(brandsByClient.entries())
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
    .map(([clientId, clientBrands]) => ({
      id: clientId,
      name: clientId === null ? 'Unassigned' : (clientName.get(clientId) ?? 'Client'),
      brands: clientBrands,
    }));

  const totalCampaigns = campaigns.length;

  return (
    <main className="main">
      <div className="topbar" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 34px)', marginTop: 8 }}>Campaigns</h1>
          <p className="subtitle">
            Every campaign across your organization, grouped by client and brand.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Boxes size={18} style={{ color: 'var(--accent)' }} />
          <span className="metric-label" style={{ flex: 1 }}>
            {clients.length} {clients.length === 1 ? 'client' : 'clients'} · {brands.length}{' '}
            {brands.length === 1 ? 'brand' : 'brands'} · <strong>{totalCampaigns}</strong>{' '}
            {totalCampaigns === 1 ? 'campaign' : 'campaigns'}
          </span>
          <span className="muted">Create and manage campaigns inside each brand&apos;s workspace.</span>
        </div>
      </div>

      {totalCampaigns === 0 ? (
        <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div className="eyebrow">No campaigns yet</div>
          <p className="subtitle">
            Open a brand&apos;s workspace below and start your first campaign from an approved strategy.
          </p>
        </div>
      ) : null}

      {clientSections.map((section) => (
        <section key={section.id ?? 'unassigned'} style={{ marginBottom: 28 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Client</div>
              <h2 style={{ margin: '4px 0' }}>{section.name}</h2>
            </div>
          </div>

          {section.brands.map((brand) => {
            const brandCampaigns = campaignsByBrand.get(brand.id) ?? [];
            return (
              <div key={brand.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <a href={`/brands/${brand.id}/campaigns`} style={{ fontWeight: 600, color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {brand.name}
                    <ArrowUpRight size={14} style={{ color: 'var(--accent)' }} />
                  </a>
                  <span className="badge tone-muted">{brand.status ?? 'brand'}</span>
                  <span className="metric-label" style={{ marginLeft: 'auto' }}>
                    {brandCampaigns.length} {brandCampaigns.length === 1 ? 'campaign' : 'campaigns'}
                  </span>
                  <a className="badge" href={`/brands/${brand.id}/campaigns`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} /> Open workspace
                  </a>
                </div>

                {brandCampaigns.length === 0 ? (
                  <p className="subtitle" style={{ padding: '14px 18px', margin: 0 }}>
                    No campaigns yet. Open the workspace to create one from an approved strategy.
                  </p>
                ) : (
                  <div>
                    {brandCampaigns.map((campaign) => {
                      const dates = formatDates(campaign);
                      return (
                        <a
                          key={campaign.id}
                          href={`/brands/${brand.id}/campaigns/${campaign.id}`}
                          className="hover-lift"
                          style={{ display: 'block', padding: '12px 18px', borderBottom: '1px solid var(--line)', color: 'inherit', textDecoration: 'none' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, flex: 1 }}>{campaign.name}</span>
                            <span className={`badge tone-${statusTone(campaign.status)}`}>
                              {CAMPAIGN_STATUS_LABELS[campaign.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? campaign.status}
                            </span>
                            <span className="metric-label">{formatBudget(campaign)}</span>
                          </div>
                          <div className="activity-meta" style={{ marginTop: 6 }}>
                            <span>{channelSummary(campaign)}</span>
                            {dates ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <CalendarDays size={13} /> {dates}
                              </span>
                            ) : null}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}