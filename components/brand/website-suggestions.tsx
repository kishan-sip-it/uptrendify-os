'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Globe2, LoaderCircle } from 'lucide-react';

type Candidate = {
  title: string;
  url: string;
  host: string;
  iconUrl: string | null;
};

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
  const [message, setMessage] = useState('');
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
            ? 'Select the official site. The URL will be filled automatically.'
            : 'No confident match yet. Keep typing the brand name or enter the public website manually.',
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

  if (!visible) return null;

  return (
    <div className="brand-suggestions" role="listbox" aria-label="Website suggestions">
      {loading ? (
        <div className="brand-suggestion-loading">
          <LoaderCircle size={14} className="spin" /> Finding official websites…
        </div>
      ) : null}

      {!loading && results.length === 0 ? (
        <div className="brand-suggestion-empty">
          <span>We couldn't find a confident public match yet.</span>
          <small>{message}</small>
        </div>
      ) : null}

      {!loading && results.length > 0 ? (
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
          <div className="brand-suggestion-note">
            Live public discovery · selecting a result fills the website field automatically.
          </div>
        </>
      ) : (
        <div className="brand-suggestion-note">{message}</div>
      )}
    </div>
  );
}
