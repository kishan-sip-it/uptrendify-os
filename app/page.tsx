import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';
import { SITE_FAQ } from '@/lib/marketing/site-content';

export const metadata: Metadata = {
  title: "AI Marketing Agency OS",
  description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
  alternates: { canonical: "/" },
  openGraph: {
    type: 'website',
    siteName: 'UpTrendifyOS',
    title: "UpTrendifyOS — AI Marketing Agency OS",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    url: "/",
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "UpTrendifyOS — AI Marketing Agency OS",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    images: ['/opengraph-image'],
  },
};

export default function Home() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'UpTrendifyOS',
      url: 'https://uptrendify-os.vercel.app/',
      logo: 'https://uptrendify-os.vercel.app/icon.svg',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'UpTrendifyOS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'A connected marketing agency workflow for public website research, human-reviewed brand intelligence, strategy, content, campaigns, approvals and publishing preparation.',
      featureList: [
        'Seven connected workflow stages',
        'Source-backed and reviewable brand intelligence',
        'Human approval before facts become authoritative',
        'Role-based isolated client workspaces',
        'Content remains ready to publish until a channel is connected',
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: SITE_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <Landing />
    </>
  );
}
