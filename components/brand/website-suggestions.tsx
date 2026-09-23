'use client';

import { useEffect, useRef, useState } from 'react';
import { Globe2, LoaderCircle } from 'lucide-react';

type Candidate = { title: string; url: string; host: string };

export function BrandWebsiteSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (brandName: string, url: string) => void;
}) {
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 3) {
      setResults([]);
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const response = await fetch('/api/brand-discovery?q=' + encodeURIComponent(clean), {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!controller.signal.aborted) {
          const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
          setResults(candidates);
          setVisible(candidates.length > 0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setVisible(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [query]);

  if (!visible && !loading) return null;

  return (
    <div className="brand-suggestions" role="listbox" aria-label="Website suggestions">
      {loading ? (
        <div className="brand-suggestion-loading"><LoaderCircle size={14} className="spin" /> Searching likely public websites…</div>
      ) : (
        <>
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
              <span className="brand-suggestion-icon"><Globe2 size={15} /></span>
              <span className="brand-suggestion-copy">
                <strong>{candidate.host}</strong>
                <span>{candidate.url}</span>
              </span>
            </button>
          ))}
          <div className="brand-suggestion-note">Live public search results — confirm the website before starting research.</div>
        </>
      )}
    </div>
  );
}
