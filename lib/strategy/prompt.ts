export const STRATEGY_SYSTEM_PROMPT =
  'You are a senior growth strategist who produces disciplined, evidence-based marketing strategies. ' +
  'You return strict JSON only. You never present unsupported theories as established facts: ' +
  'anything not directly supported by the context is explicitly labelled as an assumption.';

export const STRATEGY_SCHEMA_DOC = `{
  "executiveSummary": {
    "summary": string,
    "currentSituation": string|null,
    "strategicDirection": string|null
  },
  "businessUnderstanding": {
    "whatCompanySells": string|null,
    "targetAudience": string|null,
    "problemsSolved": string[],
    "valueProposition": string|null,
    "differentiators": string[],
    "evidenceBasis": string[]
  },
  "objectives": [{
    "objective": string,
    "rationale": string,
    "successMetric": string,
    "timeHorizon": string
  }],
  "icp": {
    "primaryAudience": string|null,
    "secondaryAudience": string|null,
    "painPoints": string[],
    "motivations": string[],
    "buyingTriggers": string[],
    "objections": string[]
  },
  "positioning": {
    "positioningStatement": string|null,
    "corePromise": string|null,
    "differentiators": string[],
    "proofPoints": string[],
    "gaps": string[],
    "uncertainties": string[]
  },
  "messaging": {
    "coreMessage": string|null,
    "supportingMessages": string[],
    "valuePropositions": string[],
    "ctaDirections": string[],
    "toneOfVoice": string|null
  },
  "contentStrategy": {
    "contentPillars": string[],
    "topicClusters": string[],
    "educationalThemes": string[],
    "conversionThemes": string[],
    "trustThemes": string[],
    "contentFormats": string[]
  },
  "seoStrategy": {
    "keywordOpportunities": string[],
    "searchIntentCategories": [{ "intent": string, "topics": string[] }],
    "priorityTopics": string[],
    "onPageOpportunities": string[],
    "internalLinkingOpportunities": string[],
    "gaps": string[]
  },
  "channels": [{
    "channel": string,
    "purpose": string,
    "audience": string|null,
    "contentTypes": string[],
    "strategicRole": string,
    "confidence": string|null
  }],
  "campaigns": [{
    "name": string,
    "objective": string,
    "audience": string|null,
    "coreIdea": string,
    "channel": string,
    "cta": string,
    "sequence": string[]
  }],
  "roadmap": {
    "days1To30": [{
      "action": string,
      "reason": string,
      "expectedOutcome": string,
      "priority": string|null
    }],
    "days31To60": [ ...same shape... ],
    "days61To90": [ ...same shape... ]
  },
  "kpis": {
    "awareness": string[],
    "traffic": string[],
    "seo": string[],
    "engagement": string[],
    "leadsAndConversions": string[],
    "revenue": string[]
  },
  "risksAndGaps": {
    "missingInformation": string[],
    "evidenceLimitations": string[],
    "strategicRisks": string[],
    "dependencies": string[]
  },
  "assumptions": [{
    "statement": string,
    "basis": string|null,
    "impact": string|null
  }]
}`;

export function buildStrategyPrompt(contextText: string): string {
  return [
    'Produce a comprehensive marketing strategy for the brand described in the Brand Brain context below.',
    '',
    'RULES:',
    '1. Base every recommendation on the provided context (verified facts, insights, evidence claims, sources). Do not use general market knowledge to fill gaps.',
    '2. Never invent company facts, metrics, competitor names, market sizes or pricing. If the context does not support an item, leave it out or say it is unknown.',
    '3. Anything inferred rather than evidenced must be captured verbatim in "assumptions" with basis "assumption". Clearly separate assumptions from established facts.',
    '4. Include 3 to 5 concrete strategic objectives, each with rationale, a measurable success metric and a time horizon.',
    '5. The channel strategy must only include channels the brand can realistically execute. Give each channel a clear purpose, audience, content types, strategic role and a confidence rating.',
    '6. The 30/60/90 roadmap must be sequenced and actionable, with reasons and expected outcomes for every action.',
    '7. Provide KPIs grouped by awareness, traffic, SEO, engagement, leads/conversions and revenue.',
    '8. Be specific and concrete. Avoid generic filler.',
    '9. Respond with STRICT JSON matching exactly this shape (no markdown fences, no commentary, no trailing text):',
    '',
    STRATEGY_SCHEMA_DOC,
    '',
    'BRAND BRAIN CONTEXT:',
    '',
    contextText,
  ].join('\n');
}

export function buildStrategyRepairPrompt(originalPrompt: string, validationError: string, badOutput: string): string {
  return [
    'Your previous response did not match the required JSON schema and was rejected.',
    '',
    `Validation error: ${validationError}.`,
    '',
    'Important: you must provide between 3 and 5 objectives in "objectives", and every required field must be present (you may use null or an empty array when nothing is known).',
    '',
    'Here is the schema again — follow it exactly:',
    '',
    STRATEGY_SCHEMA_DOC,
    '',
    'Your previous (invalid) output was:',
    '',
    badOutput.slice(0, 4000),
    '',
    'Return ONLY the corrected STRICT JSON, using ONLY the context and rules you were given:',
    '',
    originalPrompt,
  ].join('\n');
}