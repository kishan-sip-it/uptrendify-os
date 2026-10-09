import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://uptrendify-os.vercel.app');

const PUBLIC_ROUTES = [
  { path: '/', priority: 1 },
  { path: '/landing', priority: 0.8 },
  { path: '/about', priority: 0.6 },
  { path: '/contact', priority: 0.5 },
  { path: '/feedback', priority: 0.4 },
  { path: '/report-issue', priority: 0.4 },
  { path: '/terms', priority: 0.2 },
  { path: '/privacy', priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified,
    changeFrequency: 'monthly' as const,
    priority,
  }));
}
