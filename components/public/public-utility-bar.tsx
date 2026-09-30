'use client';

import { usePathname } from 'next/navigation';
import { ArrowRight, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';

export function PublicUtilityBar() {
  const pathname = usePathname();
  if (pathname !== '/') return null;

  return (
    <div className="public-utility-bar" aria-label="Public product links">
      <span className="public-utility-label"><Sparkles size={13} /> Explore UpTrendifyOS</span>
      <a href="/about">About <ArrowRight size={12} /></a>
      <a href="/contact">Contact <ArrowRight size={12} /></a>
      <a href="/feedback"><MessageSquare size={12} /> Feedback</a>
      <a href="/report-issue"><ShieldAlert size={12} /> Report issue</a>
      <span className="public-utility-legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
    </div>
  );
}
