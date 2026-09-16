import { describe, it, expect } from 'vitest';
import { assertPublicHttpUrl } from './url-security';

describe('assertPublicHttpUrl', () => {
  it('allows valid public http/https URLs', () => {
    const url = assertPublicHttpUrl('https://example.com/path');
    expect(url.hostname).toBe('example.com');
  });

  it('rejects non-http protocols', () => {
    expect(() => assertPublicHttpUrl('ftp://example.com')).toThrow('Only http/https');
    expect(() => assertPublicHttpUrl('javascript:alert(1)')).toThrow('Only http/https');
    expect(() => assertPublicHttpUrl('data:text/html,test')).toThrow('Only http/https');
  });

  it('rejects URLs with credentials', () => {
    expect(() => assertPublicHttpUrl('http://user:pass@secret.com')).toThrow('Credentials');
    expect(() => assertPublicHttpUrl('https://admin:secret@private.io')).toThrow('Credentials');
  });

  it('rejects non-standard ports', () => {
    expect(() => assertPublicHttpUrl('http://example.com:8080')).toThrow('Non-standard ports');
    expect(() => assertPublicHttpUrl('https://example.com:443')).not.toThrow();
    expect(() => assertPublicHttpUrl('http://example.com:80')).not.toThrow();
  });

  describe('private IPv4 targets', () => {
    it('rejects loopback 127.x.x.x', () => {
      expect(() => assertPublicHttpUrl('http://127.0.0.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://127.255.255.255')).toThrow('Private');
    });

    it('rejects 10.x.x.x', () => {
      expect(() => assertPublicHttpUrl('http://10.0.0.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://10.255.255.255')).toThrow('Private');
    });

    it('rejects 172.16-31.x.x', () => {
      expect(() => assertPublicHttpUrl('http://172.16.0.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://172.31.255.255')).toThrow('Private');
    });

    it('rejects 192.168.x.x', () => {
      expect(() => assertPublicHttpUrl('http://192.168.1.1')).toThrow('Private');
    });

    it('rejects link-local 169.254.x.x', () => {
      expect(() => assertPublicHttpUrl('http://169.254.169.254')).toThrow('Private');
    });

    it('rejects 0.0.0.0', () => {
      expect(() => assertPublicHttpUrl('http://0.0.0.0')).toThrow('Private');
    });

    it('rejects 192.0.0.0/24 and TEST-NETs', () => {
      expect(() => assertPublicHttpUrl('http://192.0.0.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://198.51.100.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://203.0.113.1')).toThrow('Private');
    });

    it('rejects multicast 224+ addresses', () => {
      expect(() => assertPublicHttpUrl('http://224.0.0.1')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://255.255.255.255')).toThrow('Private');
    });
  });

  it('allows valid public IPv4 addresses', () => {
    expect(() => assertPublicHttpUrl('http://8.8.8.8')).not.toThrow();
    expect(() => assertPublicHttpUrl('http://1.1.1.1')).not.toThrow();
    expect(() => assertPublicHttpUrl('http://52.218.200.100')).not.toThrow();
  });

  describe('IPv6 private targets', () => {
    it('rejects IPv6 loopback [::1]', () => {
      expect(() => assertPublicHttpUrl('http://[::1]')).toThrow('Private');
    });

    it('rejects IPv6 unspecified [::]', () => {
      expect(() => assertPublicHttpUrl('http://[::]')).toThrow('Private');
    });

    it('rejects IPv4-mapped IPv6 [::ffff:127.0.0.1]', () => {
      expect(() => assertPublicHttpUrl('http://[::ffff:127.0.0.1]')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://[::ffff:10.0.0.1]')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://[::ffff:192.168.1.1]')).toThrow('Private');
    });

    it('rejects IPv4-mapped in hex [::ffff:7f00:1]', () => {
      expect(() => assertPublicHttpUrl('http://[::ffff:7f00:1]')).toThrow('Private');
    });

    it('rejects ULA fc00::/fd00::', () => {
      expect(() => assertPublicHttpUrl('http://[fc00::1]')).toThrow('Private');
      expect(() => assertPublicHttpUrl('http://[fd00::1]')).toThrow('Private');
    });

    it('rejects link-local fe80::', () => {
      expect(() => assertPublicHttpUrl('http://[fe80::1]')).toThrow('Private');
    });

    it('rejects multicast ff00::', () => {
      expect(() => assertPublicHttpUrl('http://[ff00::1]')).toThrow('Private');
    });
  });

  it('allows valid public IPv6 addresses', () => {
    expect(() => assertPublicHttpUrl('http://[2607:f8b0:4004:800::200e]')).not.toThrow();
  });
});