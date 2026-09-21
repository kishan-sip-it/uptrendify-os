import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

export const metadata: Metadata = {
  title: 'UpTrendifyOS — AI Marketing Agency OS',
  description:
    'One operating system for research, brand intelligence, strategy, content and campaign execution across every client brand.',
};

export default function LandingPage() {
  return <Landing />;
}
