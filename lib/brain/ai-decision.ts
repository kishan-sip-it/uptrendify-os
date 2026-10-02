import { z } from 'zod';
import { createDefaultRegistry } from '@/lib/ai/registry';

export type AiDecisionSuggestion = {
  id: string;
  field: string;
  label: string;
  section: string;
  proposed_value: unknown;
  status: string;
  evidence: Array<{ claim?: string; strength?: string; excerpt?: string | null; url?: string }>;
  evidence_strength: string | null;
  sources_examined: number;
  confidence: number | null;
};

export type AiDecision = {
  suggestionId: string;
  decision: 'APPROVE' | 'REJECT' | 'REVIEW';
  confidence: number;
  reason: string;
};

const decisionSchema = z.object({
  decisions: z.array(z.object({
    suggestionId: z.string().uuid(),
    decision: z.enum(['APPROVE', 'REJECT', 'REVIEW']),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3).max(500),
  })).max(100),
});

const systemPrompt = [
  'You are UpTrendifyOS Brand Brain Decision Engine.',
  'Your task is to classify existing research suggestions for HUMAN REVIEW.',
  'You are not the final approver. Never treat your recommendation as an authoritative brand fact.',
  'Return strict JSON only.',
  '',
  'Decision rules:',
  '1. APPROVE only when the suggestion is directly supported by strong evidence and is internally consistent.',
  '2. REJECT only when the evidence clearly contradicts the proposed value or the suggestion is demonstrably unsuitable for the brand evidence.',
  '3. REVIEW when evidence is weak, partial, missing, conflicting, ambiguous, or insufficient for a confident decision.',
  '4. Absence of evidence is NOT proof that a suggestion is false. Prefer REVIEW over REJECT in that case.',
  '5. Never invent facts, sources, competitors, audience details, or reasoning not supported by the supplied suggestion data.',
  '6. Confidence must describe confidence in the recommendation, not confidence that the underlying fact is universally true.',
  '7. Keep reasons concise and evidence-based.',
].join('\n');

function compactSuggestion(suggestion: AiDecisionSuggestion) {
  return {
    id: suggestion.id,
    field: suggestion.field,
    label: suggestion.label,
    section: suggestion.section,
    proposedValue: suggestion.proposed_value,
    evidenceStrength: suggestion.evidence_strength,
    sourcesExamined: suggestion.sources_examined,
    extractedConfidence: suggestion.confidence,
    evidence: suggestion.evidence.slice(0, 4).map((item) => ({
      claim: item.claim,
      strength: item.strength,
      excerpt: item.excerpt,
      url: item.url,
    })),
  };
}

function deterministicSafety(decision: AiDecision, suggestion: AiDecisionSuggestion): AiDecision {
  const hasEvidence = suggestion.evidence.length > 0;
  const strongEvidence = suggestion.evidence_strength === 'strong';
  const contradictionFree = decision.decision !== 'REJECT' || hasEvidence;

  if (!hasEvidence && decision.decision !== 'REVIEW') {
    return {
      ...decision,
      decision: 'REVIEW',
      reason: 'No directly citable evidence is available, so this requires human review rather than an automatic recommendation.',
      confidence: Math.min(decision.confidence, 0.55),
    };
  }

  if (!strongEvidence && decision.decision === 'APPROVE') {
    return {
      ...decision,
      decision: 'REVIEW',
      reason: 'Evidence is not strong enough for an approval recommendation, so this remains for human review.',
      confidence: Math.min(decision.confidence, 0.65),
    };
  }

  if (!contradictionFree) {
    return {
      ...decision,
      decision: 'REVIEW',
      reason: 'The available evidence does not safely support an automatic rejection recommendation.',
      confidence: Math.min(decision.confidence, 0.55),
    };
  }

  return decision;
}

export async function decideBrandBrainSuggestions(suggestions: AiDecisionSuggestion[]): Promise<{ decisions: AiDecision[]; provider: string; model: string }> {
  const pending = suggestions.filter((suggestion) => suggestion.status === 'PENDING');
  if (pending.length === 0) {
    return { decisions: [], provider: 'none', model: 'none' };
  }

  const provider = createDefaultRegistry().default();
  if (!provider) {
    throw new Error('The configured AI provider is unavailable. AI Decide cannot run until the primary provider is configured.');
  }

  const result = await provider.generate({
    system: systemPrompt,
    prompt: [
      'Classify every pending suggestion exactly once.',
      '',
      'SUGGESTIONS:',
      JSON.stringify(pending.map(compactSuggestion)),
      '',
      'Return exactly this JSON shape:',
      '{"decisions":[{"suggestionId":"uuid","decision":"APPROVE|REJECT|REVIEW","confidence":0.0,"reason":"short evidence-based reason"}]}',
    ].join('\n'),
    json: true,
    temperature: 0.1,
    maxTokens: Math.min(3000, Math.max(900, pending.length * 90)),
  });

  let parsed: z.infer<typeof decisionSchema>;
  try {
    parsed = decisionSchema.parse(JSON.parse(result.text));
  } catch {
    throw new Error('The AI provider returned an invalid Brand Brain decision response. No suggestions were changed.');
  }

  const byId = new Map(pending.map((suggestion) => [suggestion.id, suggestion]));
  const normalized = parsed.decisions
    .filter((decision) => byId.has(decision.suggestionId))
    .map((decision) => deterministicSafety(decision, byId.get(decision.suggestionId)!));

  const seen = new Set(normalized.map((decision) => decision.suggestionId));
  for (const suggestion of pending) {
    if (seen.has(suggestion.id)) continue;
    normalized.push({
      suggestionId: suggestion.id,
      decision: 'REVIEW',
      confidence: 0,
      reason: 'The AI did not return a safe classification for this suggestion, so it remains for human review.',
    });
  }

  return { decisions: normalized, provider: provider.id, model: result.model };
}
