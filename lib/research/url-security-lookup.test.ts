import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return { default: { lookup } };
});

import dns from 'node:dns/promises';
import { orderPublicAddresses, resolvePublicAddresses, publicAddressLookup } from './url-security';

function addr(address: string, family: 4 | 6) {
  return { address, family };
}

describe('orderPublicAddresses', () => {
  it('puts IPv4 first while preserving IPv6 as fallback', () => {
    const ordered = orderPublicAddresses([
      addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6),
      addr('108.159.80.28', 4),
      addr('2600:9000:238c:cc00:2:9f70:c3c0:93a1', 6),
      addr('108.159.80.20', 4),
    ]);
    expect(ordered.map((a) => a.family)).toEqual([4, 4, 6, 6]);
    expect(ordered[0].address).toBe('108.159.80.28');
  });
});

describe('resolvePublicAddresses', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset();
  });

  it('filters private/loopback/link-local and deduplicates', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([
      addr('127.0.0.1', 4),
      addr('10.0.0.1', 4),
      addr('192.168.1.1', 4),
      addr('fe80::1', 6),
      addr('::ffff:10.0.0.2', 6),
      addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6),
      addr('108.159.80.28', 4),
addr('108.159.80.28', 4),
    ] as any);
    const addresses = await resolvePublicAddresses('www.example.com');
    expect(vi.mocked(dns.lookup)).toHaveBeenCalledWith('www.example.com', { all: true, verbatim: true });
    expect(addresses).toEqual([addr('108.159.80.28', 4), addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6)]);
  });

  it('returns an empty list when every address is private', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([addr('127.0.0.1', 4), addr('::1', 6)] as any);
    expect(await resolvePublicAddresses('example.com')).toEqual([]);
  });
});

describe('publicAddressLookup', () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset();
  });

  it('returns the full ordered list in all-mode (autoSelectFamily)', async () => {
vi.mocked(dns.lookup).mockResolvedValueOnce([
      addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6),
      addr('108.159.80.28', 4),
    ] as any);
    const addresses = await new Promise<any>((resolve) => {
      publicAddressLookup('www.example.com', { all: true }, (err, result) => resolve(err ? { err } : result));
    });
    expect(addresses).toEqual([addr('108.159.80.28', 4), addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6)]);
  });

  it('prefers a reachable public IPv4 in single-address mode', async () => {
vi.mocked(dns.lookup).mockResolvedValueOnce([
      addr('2600:9000:238c:5400:2:9f70:c3c0:93a1', 6),
      addr('108.159.80.28', 4),
    ] as any);
    const selected = await new Promise<{ address: string; family: number }>((resolve) => {
      publicAddressLookup('www.example.com', {}, (err, address, family) => resolve({ address: String(address), family: Number(family) }));
    });
    expect(selected).toEqual({ address: '108.159.80.28', family: 4 });
  });

  it('rejects the lookup when no public addresses resolve', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([addr('127.0.0.1', 4)] as any);
    const result = await new Promise<string>((resolve) => {
      publicAddressLookup('example.com', {}, (err, _address, _family) => resolve(err ? err.message : 'no error'));
    });
    expect(result).toContain('non-public');
  });
});