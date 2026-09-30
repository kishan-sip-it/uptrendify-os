'use client';

import { useRouter } from 'next/navigation';
import { CreateContentForm } from '@/components/content/content-studio';

export function CreateContentPage({
  brandId,
  brandName,
  initialCampaignId,
}: {
  brandId: string;
  brandName: string;
  initialCampaignId?: string | null;
}) {
  const router = useRouter();

  return (
    <section className="new-content-page" aria-labelledby="new-content-title">
      <div className="new-content-context">
        <div className="eyebrow">Content Studio · {brandName}</div>
        <h2 id="new-content-title">Build the brief</h2>
        <p className="subtitle">
          Use approved Brand Brain and strategy context. You can refine the generated version later without changing the original brief.
        </p>
        {initialCampaignId ? (
          <p className="activity-meta" style={{ margin: '8px 0 0' }}>
            This brief is being created for the selected campaign.
          </p>
        ) : null}
      </div>
      <CreateContentForm
        brandId={brandId}
        initialCampaignId={initialCampaignId}
        onCreated={() =>
          router.push(
            initialCampaignId
              ? `/brands/${brandId}/content`
              : `/brands/${brandId}/content`,
          )
        }
      />
    </section>
  );
}
