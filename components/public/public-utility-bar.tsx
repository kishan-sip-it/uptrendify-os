'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRight, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';

export function PublicUtilityBar() {
  const pathname = usePathname();
  const [footerNear, setFooterNear] = useState(false);

  useEffect(() => {
    if (pathname !== '/' && pathname !== '/landing') {
      setFooterNear(false);
      return;
    }

    const footer = document.querySelector('.landing-footer');
    if (!footer || !('IntersectionObserver' in window)) {
      setFooterNear(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setFooterNear(entry.isIntersecting),
      { threshold: 0.04 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [pathname]);

  if (pathname !== '/' && pathname !== '/landing') return null;

  return (
    <nav
      className={`public-utility-bar${footerNear ? ' is-footer-near' : ''}`}
      aria-label="Public product links"
      aria-hidden={footerNear ? true : undefined}
      inert={footerNear ? true : undefined}
    >
      <span className="public-utility-label"><Sparkles size={13} /> Explore UpTrendifyOS</span>
      <a href="/about">About <ArrowRight size={12} /></a>
      <a href="/contact">Contact <ArrowRight size={12} /></a>
      <a href="/feedback"><MessageSquare size={12} /> Feedback</a>
      <a href="/report-issue"><ShieldAlert size={12} /> Report issue</a>
      <span className="public-utility-legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
      <span className="public-utility-dots" aria-hidden="true"><i /><i /><i /></span>
    </nav>
  );
}
