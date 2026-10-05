'use client';

import { useRouter } from 'next/navigation';
import { CreateContentFormSafe } from '@/components/content/create-content-form-safe';

export function CreateContentPage({ brandId, brandName, initialCampaignId }: { brandId: string; brandName: string; initialCampaignId?: string | null }) {
  const router = useRouter();
  return <section className="new-content-page" aria-labelledby="new-content-title">
    <div className="new-content-context"><div className="eyebrow">Content Studio · {brandName}</div><h2 id="new-content-title">Build the brief</h2><p className="subtitle">Choose a compatible content format and channel, then create the brief. The AI cannot be asked to produce a combination the UI does not support.</p>{initialCampaignId ? <p className="activity-meta" style={{ margin: '8px 0 0' }}>This brief is being created for the selected campaign.</p> : null}</div>
    <CreateContentFormSafe brandId={brandId} initialCampaignId={initialCampaignId} onCreated={(contentId) => router.push(`/brands/${brandId}/content/${contentId}`)} />
  </section>;
}
