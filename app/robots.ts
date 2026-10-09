import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://uptrendify-os.vercel.app');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/auth/', '/dashboard', '/brands', '/campaigns', '/content',
        '/approvals', '/settings', '/onboarding', '/login', '/register',
        '/forgot-password', '/reset-password', '/invite', '/progress',
      ],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
