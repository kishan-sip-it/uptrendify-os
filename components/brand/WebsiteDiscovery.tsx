'use client';

import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';

type Suggestion = { title: string; url: string };

export function WebsiteDiscovery({ query, onSelect }: { query: string; onSelect: (url: string) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/brand-discovery?q=' + encodeURIComponent(value), { signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (response.ok) setSuggestions(Array.isArray(body?.suggestions) ? body.suggestions : []);
      } catch {}
      finally { setLoading(false); }
    }, 450);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  if (!loading && suggestions.length === 0) return null;
  return (
    <div className="website-suggestions" role="listbox" aria-label="Public website suggestions">
      {loading ? <div className="suggestion-loading"><LoaderCircle size={14} className="spin" /> Searching public websites…</div> : null}
      {!loading && suggestions.map((suggestion) => (
        <button type="button" className="suggestion-row" key={suggestion.url} onClick={() => { onSelect(suggestion.url); setSuggestions([]); }}>
          <span className="suggestion-check"><Check size={13} /></span>
          <span className="suggestion-main"><strong>{suggestion.title}</strong><span>{suggestion.url}</span></span>
        </button>
      ))}
    </div>
  );
}