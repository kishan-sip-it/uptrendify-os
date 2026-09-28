const CANONICAL_PUBLIC_APP_URL = 'https://uptrendify-os.vercel.app';

function isLocalBrowserOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function getEmailConfirmationRedirectUrl(origin: string, configuredUrl?: string) {
  const configured = configuredUrl?.trim();

  // Never allow a localhost value from production configuration to leak into
  // an email confirmation link. Local development also uses the canonical
  // production confirmation endpoint so real emails remain cross-device safe.
  const configuredIsLocal = configured ? isLocalBrowserOrigin(configured) : false;
  const base =
    !configuredIsLocal && configured
      ? configured
      : isLocalBrowserOrigin(origin)
        ? CANONICAL_PUBLIC_APP_URL
        : origin;

  return new URL('/auth/confirm', base).toString();
}
