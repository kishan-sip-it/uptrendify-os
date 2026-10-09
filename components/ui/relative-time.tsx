'use client';

import { useEffect, useState } from 'react';

function toRelativeTime(iso: string, now: number): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + ' hr ago';
  const days = Math.round(hours / 24);
  if (days < 30) return days + ' days ago';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RelativeTime({ date, className = '' }: { date: string; className?: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timeout = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timeout);
  }, []);
  const absolute = new Date(date);
  return (
    <time className={className} dateTime={date} title={Number.isFinite(absolute.getTime()) ? absolute.toLocaleString() : date}>
      {now ? toRelativeTime(date, now) : '—'}
    </time>
  );
}
