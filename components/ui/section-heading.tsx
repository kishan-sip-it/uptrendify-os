import { createElement, type ReactNode } from 'react';

export function SectionHeading({
  title,
  eyebrow,
  description,
  action,
  level = 2,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  level?: 2 | 3 | 4;
  className?: string;
}) {
  const headingTag = ('h' + level) as 'h2' | 'h3' | 'h4';
  return (
    <div className={['ui-section-heading', 'ui-section-heading--h' + level, className].filter(Boolean).join(' ')}>
      <div className="ui-section-heading-copy">
        {eyebrow ? <div className="eyebrow ui-section-eyebrow">{eyebrow}</div> : null}
        {createElement(headingTag, null, title)}
        {description ? <p className="subtitle ui-section-description">{description}</p> : null}
      </div>
      {action ? <div className="ui-section-heading-action">{action}</div> : null}
    </div>
  );
}
