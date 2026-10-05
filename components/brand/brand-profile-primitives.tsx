import type { ReactNode } from 'react';

/**
 * A single Brand Profile definition row: icon | label | value.
 *
 * This is the structural unit of the workspace. The reference composition is
 * built almost entirely from these rather than from nested cards, so any value
 * that needs more room should widen this row, not add a box around it.
 */
export function BrandField({
  icon,
  label,
  children,
  action,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="brand-field">
      <div className="brand-field-label">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className="brand-field-value">
        {children}
        {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      </div>
    </div>
  );
}

/** Shown when the website produced no evidence for a value. Never an error. */
export function NotDetected({ label = 'Not detected from this website' }: { label?: string }) {
  return <span className="brand-not-detected">{label}</span>;
}

export function BrandSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="brand-section">
      <div className="brand-section-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h3 className="brand-section-title">{title}</h3>
          {hint ? <p className="brand-section-hint">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function BrandPanel({
  icon,
  title,
  subtitle,
  actions,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="brand-panel">
      <header className="brand-panel-head">
        {icon ? <span className="brand-panel-head-icon">{icon}</span> : null}
        <div className="brand-panel-head-text">
          <h2 className="brand-panel-head-title">{title}</h2>
          {subtitle ? <p className="brand-panel-head-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="brand-identity-actions">{actions}</div> : null}
      </header>
      <div className="brand-panel-body">{children}</div>
    </div>
  );
}

/** Identity block: logo + name + domain, the strongest element on the page. */
export function BrandIdentityRow({
  name,
  websiteUrl,
  logoUrl,
  initials,
  actions,
}: {
  name: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  initials: string;
  actions?: ReactNode;
}) {
  let domain: string | null = null;
  if (websiteUrl) {
    try {
      domain = new URL(websiteUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = null;
    }
  }

  return (
    <div className="brand-identity">
      <div className="brand-identity-logo">
        {logoUrl ? (
          // Remote brand asset from the analysed site. Plain img keeps the
          // original aspect ratio without importing a next/image remote allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" />
        ) : (
          <span aria-hidden="true" style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
            {initials}
          </span>
        )}
      </div>
      <div className="brand-identity-text">
        <h1 className="brand-identity-name">{name || 'Untitled brand'}</h1>
        {domain ? (
          <span className="brand-identity-domain">
            <a href={websiteUrl ?? '#'} target="_blank" rel="noreferrer noopener">
              {domain}
            </a>
          </span>
        ) : (
          <span className="brand-not-detected">No website recorded</span>
        )}
      </div>
      {actions ? <div className="brand-identity-actions">{actions}</div> : null}
    </div>
  );
}

/** Deterministic fallback monogram when no logo was detected. */
export function brandInitials(name: string | null): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}