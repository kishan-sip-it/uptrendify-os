'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('UpTrendifyOS application error', { message: error.message, digest: error.digest });
  }, [error]);

  const buildSha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'unknown';

  return (
    <main className="main" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="card" style={{ maxWidth: 620, width: '100%', textAlign: 'center' }}>
        <div className="eyebrow">Something went wrong</div>
        <h1 style={{ marginTop: 8 }}>UpTrendifyOS hit an unexpected error.</h1>
        <p className="subtitle" style={{ margin: '0 auto 18px' }}>
          Your data is unchanged. Try the page again; if the problem persists, check the workspace service health.
        </p>
        <p className="chip" style={{ margin: '0 auto 16px', display: 'inline-block' }}>
          Build: {buildSha === 'unknown' ? 'not exposed' : buildSha.slice(0, 12)}
          {error.digest ? ` · Error: ${error.digest}` : ''}
        </p>
        {process.env.NODE_ENV === 'development' && error.message ? (
          <pre style={{ textAlign: 'left', overflow: 'auto', padding: 12, borderRadius: 10, background: 'rgba(7,11,18,.7)', border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 12 }}>
            {error.message}
          </pre>
        ) : null}
        <button type="button" className="badge" onClick={() => reset()} style={{ border: 0, cursor: 'pointer', padding: '10px 15px' }}>
          Try again
        </button>
      </section>
    </main>
  );
}
