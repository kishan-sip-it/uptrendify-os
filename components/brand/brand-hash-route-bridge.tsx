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
    const view = HASH_TO_VIEW[window.location.hash];
    if (!view || !/^\/brands\/[^/]+$/.test(pathname)) return;
    router.replace(`${pathname}?view=${view}`);
  }, [pathname, router]);

  return null;
}
