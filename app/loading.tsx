import { LoadingState } from '@/components/ui/feedback';

export default function Loading() {
  return (
    <main className="main" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <LoadingState label="Loading workspace…" />
      </div>
    </main>
  );
}