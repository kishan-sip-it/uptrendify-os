import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'UpTrendifyOS — AI Marketing Agency OS',
    short_name: 'UpTrendifyOS',
    description: 'Research, review, plan, create, approve and prepare marketing work for publishing.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F7FB',
    theme_color: '#5B5BF0',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    categories: ['business', 'productivity'],
  };
}
