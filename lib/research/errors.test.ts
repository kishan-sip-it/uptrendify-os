import { describe, it, expect } from 'vitest';
import { translateResearchError } from './errors';

describe('translateResearchError', () => {
  it('maps DNS errors to DNS_NOT_FOUND', () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND www.nope.invalid'), { code: 'ENOTFOUND' });
    expect(translateResearchError(err)).toEqual({ code: 'DNS_NOT_FOUND', message: err.message });
  });

  it('maps transient DNS failures to DNS_TEMPORARY_FAILURE', () => {
    const err = Object.assign(new Error('EAI_AGAIN'), { code: 'EAI_AGAIN' });
    expect(translateResearchError(err).code).toBe('DNS_TEMPORARY_FAILURE');
  });

  it('maps unreachable network errors to NETWORK_UNREACHABLE', () => {
    expect(translateResearchError(Object.assign(new Error('no route'), { code: 'EHOSTUNREACH' })).code).toBe('NETWORK_UNREACHABLE');
    expect(translateResearchError(Object.assign(new Error('net down'), { code: 'ENETUNREACH' })).code).toBe('NETWORK_UNREACHABLE');
  });

  it('maps connection errors', () => {
    expect(translateResearchError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })).code).toBe('CONNECTION_REFUSED');
    expect(translateResearchError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })).code).toBe('CONNECTION_RESET');
    expect(translateResearchError(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })).code).toBe('CONNECTION_TIMEOUT');
  });

  it('maps TLS certificate errors', () => {
    expect(translateResearchError(Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).code).toBe('TLS_CERTIFICATE_ERROR');
    expect(translateResearchError(Object.assign(new Error('alt name mismatch'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })).code).toBe('TLS_CERTIFICATE_ERROR');
  });

  it('maps undici timeout errors', () => {
    expect(translateResearchError(Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })).code).toBe('CONNECTION_TIMEOUT');
    expect(translateResearchError(Object.assign(new Error('headers timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' })).code).toBe('RESPONSE_TIMEOUT');
  });

  it('maps fetch aborts to REQUEST_TIMEOUT', () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    expect(translateResearchError(abort)).toEqual({ code: 'REQUEST_TIMEOUT', message: 'This operation was aborted' });
  });

  it('maps blocked/private targets to BLOCKED_TARGET', () => {
    expect(translateResearchError(new Error('Private, loopback or link-local targets are blocked')).code).toBe('BLOCKED_TARGET');
    expect(translateResearchError(new Error('Research hostname resolves to a non-public address (10.0.0.1)')).code).toBe('BLOCKED_TARGET');
  });

  it('falls back to RESEARCH_FAILED for unknown errors', () => {
    expect(translateResearchError(new Error('something weird')).code).toBe('RESEARCH_FAILED');
  });
});