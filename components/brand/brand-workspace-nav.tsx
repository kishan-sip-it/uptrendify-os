'use client';

import { usePathname, useSearchParams } from 'next/navigation';

type BrandWorkspaceNavProps = {
  brandId: string;
  current?: 'profile' | 'overview' | 'brain' | 'strategy' | 'campaigns' | 'content';
};

const tabs = [
  { key: 'profile' as const, label: 'Profile', href: (id: string) => `/brands/${id}?view=profile` },
  { key: 'overview' as const, label: 'Overview', href: (id: string) => `/brands/${id}` },
  { key: 'brain' as const, label: 'Brand Brain', href: (id: string) => `/brands/${id}?view=brain` },
  { key: 'strategy' as const, label: 'Strategy', href: (id: string) => `/brands/${id}?view=strategy` },
  { key: 'campaigns' as const, label: 'Campaigns', href: (id: string) => `/brands/${id}/campaigns` },
  { key: 'content' as const, label: 'Content', href: (id: string) => `/brands/${id}/content` },
];

export function BrandWorkspaceNav({ brandId, current }: BrandWorkspaceNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryView = searchParams.get('view');
  const inferred = pathname.endsWith('/campaigns')
    ? 'campaigns'
    : pathname.endsWith('/content')
      ? 'content'
      : queryView === 'brain'
        ? 'brain'
        : queryView === 'strategy'
          ? 'strategy'
          : 'overview';
  const active = current ?? inferred;

  return (
    <nav className="brand-workspace-nav" aria-label="Brand workspace">
      <div className="brand-workspace-nav-scroll">
        {tabs.map((tab) => (
          <a
            key={tab.key}
            href={tab.href(brandId)}
            className={`brand-workspace-tab ${active === tab.key ? 'active' : ''}`}
            aria-current={active === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
