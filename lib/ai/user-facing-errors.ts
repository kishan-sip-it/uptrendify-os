const RETRY_SECONDS = /try again in\s+([0-9.]+)s/i;

export function getUserFacingAiError(message?: unknown, code?: unknown): string {
  const raw = typeof message === 'string' ? message.trim() : '';
  const normalizedCode = typeof code === 'string' ? code : '';
  const lower = `${normalizedCode} ${raw}`.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('tokens per minute') || lower.includes('tpm')) {
    const match = raw.match(RETRY_SECONDS);
    const retry = match ? ` Try again in about ${Math.ceil(Number(match[1]))} seconds.` : ' Please retry shortly.';
    return `The AI provider is temporarily rate-limited.${retry}`;
  }
  if (lower.includes('wrong content type')) {
    const match = raw.match(/wrong content type \(([^)]+)\); expected ([^\s.]+)/i);
    return match ? `The selected content type is not compatible with this generation. Choose ${match[2].replaceAll('_', ' ')} or regenerate with a compatible format.` : 'The selected content type is not compatible with this generation. Choose a compatible format and try again.';
  }
  if (lower.includes('wrong channel')) return 'The selected channel is not compatible with this generation. Choose a compatible channel and try again.';
  if (lower.includes('not valid json') || lower.includes('failed validation')) return 'The AI returned an incomplete or malformed draft. Nothing was published or approved. Try generating again.';
  if (lower.includes('timeout') || lower.includes('aborted')) return 'The AI provider took too long to respond. No new version was created. Try again.';
  if (lower.includes('not configured') || lower.includes('503')) return 'The AI provider is not currently available. Check the configured provider and try again.';
  if (lower.includes('dns') || lower.includes('eai_again') || lower.includes('ebusy') || lower.includes('enotfound')) return 'The research source is temporarily unreachable. The run was not treated as a successful analysis. Retry the research when the source is reachable.';
  if (raw.startsWith('Provider returned')) return 'The AI provider rejected this generation request. No new version was created. Try again or use another configured model.';
  return raw || 'The AI generation could not be completed. No new version was created.';
}
