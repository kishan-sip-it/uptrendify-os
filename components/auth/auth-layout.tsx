import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <div className="auth-card-wrap">
        <Link href="/" className="auth-brand" aria-label="UpTrendifyOS home">
          <span className="logo" /> UpTrendifyOS
        </Link>
        <div className="auth-head">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </div>
    </main>
  );
}