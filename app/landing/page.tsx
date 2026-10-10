import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  title: "AI Marketing Agency Workflow",
  description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
  alternates: { canonical: "/landing" },
  openGraph: {
    type: 'website',
    siteName: 'UpTrendifyOS',
    title: "AI Marketing Agency Workflow",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    url: "/landing",
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "AI Marketing Agency Workflow",
    description: "Research client brands, review evidence-backed brand intelligence, build strategies and create connected marketing work.",
    images: ['/opengraph-image'],
  },
};

export default function LandingPage() {
  return <Landing />;
}
