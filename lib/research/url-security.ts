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

const dnsLookupTimeoutMs = 5_000;

async function resolveAllAddresses(hostname: string): Promise<LookupAddress[]> {
  const addresses = await Promise.race([
    dns.lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Research hostname lookup timed out')), dnsLookupTimeoutMs);
    }),
  ]);
  const seen = new Set<string>();
  const unique: LookupAddress[] = [];
  for (const entry of addresses) {
    if (seen.has(entry.address)) continue;
    seen.add(entry.address);
    unique.push(entry);
  }
  return unique;
}

export async function resolvePublicAddresses(hostname: string): Promise<LookupAddress[]> {
  const unique = await resolveAllAddresses(hostname);
  return orderPublicAddresses(unique.filter((entry) => !isPrivateIp(entry.address)));
}

// Prefer reachable public IPv4 first (virtually always routable), keep public
// IPv6 as a fallback so IPv6-only targets still work where the network allows.
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
        // Node autoSelectFamily path: hand over the full ordered list and let
        // the socket layer fall back across addresses.
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
    // Happy Eyeballs: Node tries every public address we return until one
    // connects, so an unreachable first DNS record (e.g. IPv6 without a route)
    // no longer makes otherwise-reachable sites fail.
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
  const addresses = await resolveAllAddresses(hostname);
  if (!addresses.length) throw new Error('Unable to resolve research hostname');
  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new Error(`Research hostname resolves to a non-public address (${entry.address})`);
    }
  }
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