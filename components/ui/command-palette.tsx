'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Command, Search } from 'lucide-react';

type CommandItem = { id: string; label: string; hint: string; href: string };

const COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Overview', href: '/dashboard' },
  { id: 'brands', label: 'Brands', hint: 'Portfolio', href: '/brands' },
  { id: 'add-brand', label: 'Add brand', hint: 'Website analysis', href: '/brands/new' },
  { id: 'campaigns', label: 'Campaigns', hint: 'Organization view', href: '/campaigns' },
  { id: 'content', label: 'Content Studio', hint: 'Open content workspace', href: '/content' },
  { id: 'approvals', label: 'Approvals', hint: 'Review and publishing', href: '/approvals' },
  { id: 'settings', label: 'Settings', hint: 'Workspace preferences', href: '/settings' },
  { id: 'team', label: 'Team settings', hint: 'Members and roles', href: '/settings/team' },
  { id: 'health', label: 'System health', hint: 'Diagnostics', href: '/settings/system-health' },
  { id: 'trash', label: 'Trash and archive', hint: 'Recovery tools', href: '/settings/trash' },
];

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return COMMANDS;
    return COMMANDS.filter((item) => (item.label + ' ' + item.hint).toLowerCase().includes(normalized));
  }, [query]);

  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!dialogRef.current?.open) {
          dialogRef.current?.showModal();
          setQuery('');
          setActive(0);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function open() {
    if (dialogRef.current?.open) return;
    setQuery('');
    setActive(0);
    dialogRef.current?.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function close() {
    dialogRef.current?.close();
    setQuery('');
    setActive(0);
  }

  function go(item: CommandItem | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  return (
    <>
      <button
        type="button"
        className="ui-command-trigger"
        onClick={open}
        aria-label="Open command palette"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        title="Navigate (Ctrl/⌘ K)"
      >
        <Search size={14} aria-hidden="true" />
        <span>Navigate</span>
        <kbd><Command size={10} aria-hidden="true" /> K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="ui-command-dialog"
        aria-label="Navigate UpTrendifyOS"
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setActive((index) => (index + 1) % results.length);
          } else if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setActive((index) => (index - 1 + results.length) % results.length);
          } else if (event.key === 'Enter') {
            const item = results[active];
            if (item) {
              event.preventDefault();
              go(item);
            }
          }
        }}
      >
        <div className="ui-command-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            placeholder="Go to a page or action…"
            aria-label="Find a page or action"
            aria-controls="ui-command-results"
            aria-autocomplete="list"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="ui-command-section-label">Workspace navigation</div>
        <ul id="ui-command-results" className="ui-command-results" role="listbox" aria-label="Pages and actions">
          {results.map((item, index) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={'ui-command-option' + (index === active ? ' is-active' : '')}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item)}
              >
                <span className="ui-command-option-icon"><ArrowRight size={14} aria-hidden="true" /></span>
                <span className="ui-command-option-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
                {index === active ? <kbd>ENTER</kbd> : null}
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="ui-command-empty" role="presentation">
              <Search size={17} aria-hidden="true" />
              <strong>No matching pages</strong>
              <span>Try a page name like Brands, Campaigns or Settings.</span>
            </li>
          ) : null}
        </ul>
        <footer className="ui-command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open page</span>
          <span><kbd>ESC</kbd> Close</span>
        </footer>
      </dialog>
    </>
  );
}
