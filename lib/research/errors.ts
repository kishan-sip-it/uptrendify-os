export type ResearchErrorInfo = { code: string; message: string };

const NODE_CODE_MAP: Record<string, string> = {
  ENOTFOUND: 'DNS_NOT_FOUND',
  EAI_AGAIN: 'DNS_TEMPORARY_FAILURE',
  ECONNREFUSED: 'CONNECTION_REFUSED',
  ECONNRESET: 'CONNECTION_RESET',
  EPIPE: 'CONNECTION_RESET',
  ETIMEDOUT: 'CONNECTION_TIMEOUT',
  EHOSTUNREACH: 'NETWORK_UNREACHABLE',
  ENETUNREACH: 'NETWORK_UNREACHABLE',
  ENETDOWN: 'NETWORK_UNREACHABLE',
  EPROTO: 'TLS_HANDSHAKE_FAILED',
  CERT_HAS_EXPIRED: 'TLS_CERTIFICATE_ERROR',
  CERT_DATE_INVALID: 'TLS_CERTIFICATE_ERROR',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS_CERTIFICATE_ERROR',
  SELF_SIGNED_CERT_IN_CHAIN: 'TLS_CERTIFICATE_ERROR',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS_CERTIFICATE_ERROR',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_CERTIFICATE_ERROR',
  UND_ERR_CONNECT_TIMEOUT: 'CONNECTION_TIMEOUT',
  UND_ERR_HEADERS_TIMEOUT: 'RESPONSE_TIMEOUT',
  UND_ERR_BODY_TIMEOUT: 'RESPONSE_TIMEOUT',
  UND_ERR_SOCKET: 'CONNECTION_FAILED',
};

export function translateResearchError(error: unknown): ResearchErrorInfo {
  const err = error instanceof Error ? error : new Error(String(error));
  const name = err.name;
  const rawMessage = err.message || String(error);

  if (name === 'AbortError' || name === 'TimeoutError') {
    return { code: 'REQUEST_TIMEOUT', message: rawMessage };
  }
  const code = (err as { code?: unknown }).code;
  const mapped = typeof code === 'string' ? NODE_CODE_MAP[code] : undefined;
  if (mapped) return { code: mapped, message: rawMessage };
  if (/aborted|timed out|timeout/i.test(rawMessage)) {
    return { code: 'REQUEST_TIMEOUT', message: rawMessage };
  }
  if (/non-public|blocked|private,|link-local/i.test(rawMessage)) {
    return { code: 'BLOCKED_TARGET', message: rawMessage };
  }
  return { code: 'RESEARCH_FAILED', message: rawMessage };
}