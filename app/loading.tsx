import { PageSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="main ui-route-loading" aria-busy="true">
      <PageSkeleton />
    </main>
  );
}
