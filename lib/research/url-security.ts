import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) | Number(part), 0) >>> 0;
}

function isPrivateIpv4(ip: string) {
  if (!net.isIPv4(ip)) return true;
  const value = ipv4ToInt(ip);
  const blocks: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];
  return blocks.some(([base, prefix]) => {
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function embeddedIpv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  const prefix =
    lower.startsWith('::ffff:') ? '::ffff:'
    : lower.startsWith('::') ? '::'
    : lower.startsWith('64:ff9b::') ? '64:ff9b::'
    : null;
  if (!prefix) return null;
  const tail = lower.slice(prefix.length);
  const dotted = tail.split('.');
  if (dotted.length === 4) {
    if (dotted.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return dotted.join('.');
    return null;
  }
  const hextets = tail.split(':');
  if (hextets.length === 2 && hextets.every((h) => /^[0-9a-f]{1,4}$/.test(h))) {
    const bytes: number[] = [];
    for (const h of hextets) {
      const padded = h.padStart(4, '0');
      bytes.push(parseInt(padded.slice(0, 2), 16), parseInt(padded.slice(2, 4), 16));
    }
    return bytes.join('.');
  }
  return null;
}

function isPrivateIpv6(ip: string) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('ff')) return true;
  if ((lower.startsWith('fc') || lower.startsWith('fd')) && net.isIPv6(lower)) return true;
  if (lower.startsWith('fe80:') && net.isIPv6(lower)) return true;
  const mapped = embeddedIpv4(lower);
  if (mapped && isPrivateIpv4(mapped)) return true;
  return false;
}

function isPrivateIp(ip: string) {
  const bare = ip.replace(/^\[|\]$/g, '');
  if (net.isIPv4(bare)) return isPrivateIpv4(bare);
  if (net.isIPv6(bare)) return isPrivateIpv6(bare);
  return false;
}

export type LookupAddress = { address: string; family: number };

const dnsLookupTimeoutMs = 3_500;
const transientDnsCodes = new Set(['EAI_AGAIN', 'EBUSY', 'ECONNRESET', 'ECONNREFUSED', 'ESERVFAIL', 'ETIMEDOUT']);
const PUBLIC_DNS_CACHE_TTL_MS = 15_000;
const PUBLIC_DNS_CACHE_MAX_ENTRIES = 256;

type CachedPublicDnsEntry = { expiresAt: number; addresses: LookupAddress[] };
type DnsResolutionResult = { allAddresses: LookupAddress[]; publicAddresses: LookupAddress[] };

// Cache only IP addresses already checked against the public-address policy.
// Reuse them for validation and socket lookup so one scan doesn't repeatedly
// consume resolver time, and pin the socket lookup to the address we validated.
const publicDnsCache = new Map<string, CachedPublicDnsEntry>();
const publicDnsInFlight = new Map<string, Promise<DnsResolutionResult>>();

function dnsCacheKey(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

function cloneDnsResolution(result: DnsResolutionResult): DnsResolutionResult {
  return {
    allAddresses: result.allAddresses.map((entry) => ({ ...entry })),
    publicAddresses: result.publicAddresses.map((entry) => ({ ...entry })),
  };
}

async function lookupWithTimeout(hostname: string): Promise<LookupAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Research hostname lookup timed out') as NodeJS.ErrnoException;
          error.code = 'ETIMEDOUT';
          reject(error);
        }, dnsLookupTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveRecordFamily(hostname: string, family: 4 | 6): Promise<LookupAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const query = family === 4 ? dns.resolve4(hostname) : dns.resolve6(hostname);
  try {
    const values = await Promise.race([
      query,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Research hostname IPv${family} record lookup timed out`) as NodeJS.ErrnoException;
          error.code = 'ETIMEDOUT';
          reject(error);
        }, dnsLookupTimeoutMs);
      }),
    ]);
    return values.map((address) => ({ address, family }));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveWithDnsRecords(hostname: string): Promise<LookupAddress[]> {
  // dns.lookup uses the OS/NSS resolver path. Querying A and AAAA records
  // directly is a fallback for transient OS resolver stalls; both results still
  // pass the exact same public-IP filter before any socket can connect.
  const results = await Promise.allSettled([
    resolveRecordFamily(hostname, 4),
    resolveRecordFamily(hostname, 6),
  ]);
  const addresses = results
    .filter((result): result is PromiseFulfilledResult<LookupAddress[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  const seen = new Set<string>();
  const unique = addresses.filter((entry) => {
    if (seen.has(entry.address)) return false;
    seen.add(entry.address);
    return true;
  });
  if (unique.length > 0) return unique;

  const fallbackErrors = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);
  const transientError = fallbackErrors.find((error) => {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
    return transientDnsCodes.has(code);
  });
  if (transientError) throw transientError;
  // ENODATA / ENOTFOUND in both families means there is no usable A/AAAA result.
  return [];
}

async function resolveAllAddresses(hostname: string): Promise<LookupAddress[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const addresses = await lookupWithTimeout(hostname);
      const seen = new Set<string>();
      const unique: LookupAddress[] = [];
      for (const entry of addresses) {
        if (seen.has(entry.address)) continue;
        seen.add(entry.address);
        unique.push(entry);
      }
      return unique;
    } catch (error) {
      lastError = error;
      const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : '';
      if (!transientDnsCodes.has(code)) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  try {
    return await resolveWithDnsRecords(hostname);
  } catch (fallbackError) {
    // Preserve a retryable DNS failure if both resolver paths are unavailable.
    throw fallbackError instanceof Error ? fallbackError : (lastError instanceof Error ? lastError : new Error(String(fallbackError)));
  }
}

async function resolvePublicDns(hostname: string): Promise<DnsResolutionResult> {
  const key = dnsCacheKey(hostname);
  const now = Date.now();
  const cached = publicDnsCache.get(key);
  if (cached && cached.expiresAt > now) {
    // A positive cache entry is safe to represent as both lists: it contains
    // only the already-validated public addresses from the original resolution.
    publicDnsCache.delete(key);
    publicDnsCache.set(key, cached);
    return cloneDnsResolution({ allAddresses: cached.addresses, publicAddresses: cached.addresses });
  }
  if (cached) publicDnsCache.delete(key);

  const existing = publicDnsInFlight.get(key);
  if (existing) return cloneDnsResolution(await existing);

  const lookup = (async (): Promise<DnsResolutionResult> => {
    const allAddresses = await resolveAllAddresses(hostname);
    const publicAddresses = orderPublicAddresses(allAddresses.filter((entry) => !isPrivateIp(entry.address)));

    // Empty or private-only DNS answers are deliberately not cached. Existing
    // callers still receive an empty public-address list for private-only hosts.
    if (publicAddresses.length > 0) {
      while (publicDnsCache.size >= PUBLIC_DNS_CACHE_MAX_ENTRIES) {
        const oldestKey = publicDnsCache.keys().next().value;
        if (!oldestKey) break;
        publicDnsCache.delete(oldestKey);
      }
      publicDnsCache.set(key, { expiresAt: Date.now() + PUBLIC_DNS_CACHE_TTL_MS, addresses: publicAddresses });
    }
    return { allAddresses, publicAddresses };
  })();
  publicDnsInFlight.set(key, lookup);
  try {
    return cloneDnsResolution(await lookup);
  } finally {
    if (publicDnsInFlight.get(key) === lookup) publicDnsInFlight.delete(key);
  }
}

export async function resolvePublicAddresses(hostname: string): Promise<LookupAddress[]> {
  return (await resolvePublicDns(hostname)).publicAddresses;
}

export function orderPublicAddresses(addresses: LookupAddress[]): LookupAddress[] {
  return [...addresses.filter((a) => a.family === 4), ...addresses.filter((a) => a.family === 6)];
}

export function assertPublicHttpUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed');
  if (url.username || url.password) throw new Error('Credentials in URLs are not allowed');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Non-standard ports are not allowed');
  if (isPrivateIp(url.hostname)) throw new Error('Private, loopback or link-local targets are blocked');
  return url;
}

export type DnsLookupCallback = (
  error: Error | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export function publicAddressLookup(hostname: string, options: { all?: boolean }, callback: DnsLookupCallback): void {
  void resolvePublicAddresses(hostname)
    .then((addresses) => {
      if (!addresses.length) {
        callback(new Error('Research hostname resolves to a non-public address'), '', 0);
        return;
      }
      if (options.all === true) {
        callback(null, addresses, undefined);
        return;
      }
      const first = addresses[0];
      callback(null, first.address, first.family);
    })
    .catch((error) => callback(error instanceof Error ? error : new Error(String(error)), '', 0));
}

export const publicLookupDispatcher = new Agent({
  connect: {
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 400,
    lookup: publicAddressLookup,
  },
});

export function fetchPublicHttp(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    dispatcher: publicLookupDispatcher,
  } as RequestInit & { dispatcher: Agent });
}

export async function assertResolvablePublicHost(hostname: string) {
  // Shares the same short-lived, public-only result used by the HTTP dispatcher.
  // The validation preflight and socket connect therefore don't each perform DNS.
  const { allAddresses, publicAddresses } = await resolvePublicDns(hostname);
  if (publicAddresses.length > 0) return;

  if (allAddresses.length > 0) {
    throw new Error(`Research hostname resolves to a non-public address (${allAddresses[0]!.address})`);
  }
  throw new Error('Unable to resolve research hostname');
}

export function readBoundedBody(response: Response, maxBytes: number): Promise<{ content: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    if (!response.body) {
      resolve({ content: '', truncated: false });
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let content = '';
    let bytes = 0;
    let truncated = false;

    function pump(): void {
      reader.read().then(({ done, value }) => {
        if (done) {
          resolve({ content, truncated });
          return;
        }
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          truncated = true;
          reader.cancel().catch(() => undefined);
          resolve({ content, truncated });
          return;
        }
        content += decoder.decode(value, { stream: true });
        pump();
      }).catch(reject);
    }
    pump();
  });
}
