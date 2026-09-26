'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe2, LoaderCircle, Search, X } from 'lucide-react';

type Candidate = {
  title: string;
  url: string;
  host: string;
  iconUrl: string | null;
};

export function BrandWebsiteSuggestions({
  query,
  onSelect,
  onDismiss,
}: {
  query: string;
  onSelect: (brandName: string, url: string) => void;
  onDismiss?: () => void;
}) {
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 3) {
      requestRef.current?.abort();
      setResults([]);
      setVisible(false);
      setLoading(false);
      setMessage('');
      return;
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setVisible(true);
      setMessage('');

      try {
        const response = await fetch('/api/brand-discovery?q=' + encodeURIComponent(clean), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);

        if (controller.signal.aborted) return;

        const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
        setResults(candidates);
        setVisible(true);
        setMessage(
          candidates.length > 0
            ? 'Results are ranked toward the most relevant official-looking matches. Nothing is required to be selected.'
            : 'No confident official match found. You can search again, dismiss this list, or enter the public website manually.',
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setVisible(true);
        setMessage(
          error instanceof Error && error.name === 'AbortError'
            ? ''
            : 'Live discovery is temporarily unavailable. You can still enter the website manually.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 360);

    return () => window.clearTimeout(timer);
  }, [query]);

  const dismiss = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        dismiss();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dismiss, visible]);

  if (!visible) return null;

  return (
    <div className="brand-suggestions" ref={rootRef} role="listbox" aria-label="Website suggestions">
      <div className="brand-suggestions-head">
        <div>
          <strong><Search size={13} /> Website matches</strong>
          <span>Optional suggestions. Select one to fill the URL, or close this list and enter/search manually.</span>
        </div>
        <button type="button" className="brand-suggestions-close" aria-label="Close website suggestions" onClick={dismiss}>
          <X size={15} />
        </button>
      </div>

      {loading ? (
        <div className="brand-suggestion-loading">
          <LoaderCircle size={14} className="spin" /> Checking search results and likely official domains…
        </div>
      ) : null}

      {!loading && results.length === 0 ? (
        <div className="brand-suggestion-empty">
          <span>No confident official match found.</span>
          <small>{message}</small>
        </div>
      ) : null}

      {!loading && results.length > 0 ? (
        <>
          <div className="brand-suggestion-list">
            {results.map((candidate) => (
              <button
                type="button"
                className="brand-suggestion"
                key={candidate.url}
                role="option"
                onClick={() => {
                  onSelect(query.trim(), candidate.url);
                  setVisible(false);
                }}
              >
                <span className="brand-suggestion-icon" aria-hidden="true">
                  {candidate.iconUrl ? (
                    <img
                      src={candidate.iconUrl}
                      alt=""
                      width={24}
                      height={24}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe2 size={16} />
                  )}
                </span>
                <span className="brand-suggestion-copy">
                  <strong>{candidate.title || candidate.host}</strong>
                  <span>{candidate.host}</span>
                  <span>{candidate.url}</span>
                </span>
                <ExternalLink size={14} className="brand-suggestion-external" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="brand-suggestions-footer">
            <span>{results.length} ranked public match{results.length === 1 ? '' : 'es'} · scroll for all results</span>
            <button type="button" onClick={dismiss}>Enter website manually</button>
          </div>
        </>
      ) : (
        <div className="brand-suggestions-footer">
          <span>{message}</span>
          <button type="button" onClick={dismiss}>Enter website manually</button>
        </div>
      )}
    </div>
  );
}
