export function compactUrl(raw: string, maxLength = 88): string {
  const value = raw.trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, '');
    const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
    const compact = host + path;
    if (compact.length <= maxLength) return compact;

    const room = Math.max(12, maxLength - host.length - 1);
    if (host.length + 1 >= maxLength) return host.slice(0, maxLength - 1) + '…';
    return host + path.slice(0, room) + '…';
  } catch {
    return value.length > maxLength ? value.slice(0, maxLength - 1) + '…' : value;
  }
}

export function isRawUrlLabel(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}
