import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="main" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="card" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
        <div className="eyebrow">404</div>
        <h1 style={{ marginTop: 8 }}>That page does not exist.</h1>
        <p className="subtitle" style={{ margin: '0 auto 18px' }}>
          The link may be stale, or the workspace resource may have moved.
        </p>
        <Link href="/" className="badge" style={{ display: 'inline-flex', padding: '10px 15px' }}>Back to UpTrendifyOS</Link>
      </section>
    </main>
  );
}
