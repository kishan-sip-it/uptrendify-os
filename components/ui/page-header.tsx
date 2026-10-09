import type { ReactNode } from 'react';

export type BreadcrumbItem = { label: string; href?: string };

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs = [],
  action,
  status,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      {breadcrumbs.length ? (
        <nav className="ui-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((item, index) => (
              <li key={item.label + '-' + index}>
                {item.href && index !== breadcrumbs.length - 1
                  ? <a href={item.href}>{item.label}</a>
                  : <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{item.label}</span>}
                {index < breadcrumbs.length - 1 ? <span className="ui-breadcrumb-separator" aria-hidden="true">/</span> : null}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="ui-page-header-row">
        <div className="ui-page-header-copy">
          {eyebrow ? <div className="eyebrow ui-page-eyebrow">{eyebrow}</div> : null}
          <div className="ui-page-title-row">
            <h1>{title}</h1>
            {status ? <div className="ui-page-header-status">{status}</div> : null}
          </div>
          {description ? <p className="subtitle ui-page-description">{description}</p> : null}
        </div>
        {action ? <div className="ui-page-header-action">{action}</div> : null}
      </div>
    </header>
  );
}
