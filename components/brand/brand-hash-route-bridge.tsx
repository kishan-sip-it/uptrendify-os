'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const HASH_TO_VIEW: Record<string, string> = {
  '#intelligence': 'brain',
  '#strategy': 'strategy',
};

export function BrandHashRouteBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!/^\/brands\/[^/]+$/.test(pathname)) return;

    const navigateFromHash = () => {
      const view = HASH_TO_VIEW[window.location.hash];
      if (!view) return;
      router.replace(`${pathname}?view=${view}`);
    };

    navigateFromHash();
    window.addEventListener('hashchange', navigateFromHash);
    return () => window.removeEventListener('hashchange', navigateFromHash);
  }, [pathname, router]);

  return null;
}
