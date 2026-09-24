'use client';

import { useRouter } from 'next/navigation';
import { CreateContentForm } from '@/components/content/content-studio';

export function CreateContentPage({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();

  return (
    <section className="new-content-page" aria-labelledby="new-content-title">
      <div className="new-content-context">
        <div className="eyebrow">Content Studio · {brandName}</div>
        <h2 id="new-content-title">Build the brief</h2>
        <p className="subtitle">Use approved Brand Brain and strategy context. You can refine the generated version later without changing the original brief.</p>
      </div>
      <CreateContentForm
        brandId={brandId}
        onCreated={() => router.push(`/brands/${brandId}/content`)}
      />
    </section>
  );
}
