import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a,b,c] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

export function assertPublicHttpUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed');
  if (url.username || url.password) throw new Error('Credentials in URLs are not allowed');
  if (url.port && !['80','443'].includes(url.port)) throw new Error('Non-standard ports are not allowed');
  if (net.isIP(url.hostname)) {
    if (net.isIPv4(url.hostname) && isPrivateIpv4(url.hostname)) throw new Error('Private IPv4 targets are blocked');
    if (net.isIPv6(url.hostname) && isPrivateIpv6(url.hostname)) throw new Error('Private IPv6 targets are blocked');
  }
  return url;
}

export async function assertResolvablePublicHost(hostname: string) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Unable to resolve research hostname');
  for (const entry of addresses) {
    if (net.isIPv4(entry.address) && isPrivateIpv4(entry.address)) throw new Error('Research hostname resolves to private IPv4');
    if (net.isIPv6(entry.address) && isPrivateIpv6(entry.address)) throw new Error('Research hostname resolves to private IPv6');
  }
}
