export interface GenerateInput {
  prompt: string;
  system?: string;
  model?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  usage?: Usage;
}

export interface ProviderHealth {
  id: string;
  ok: boolean;
  configured: boolean;
  error?: string;
}

export interface AiProvider {
  id: string;
  defaultModel: string;
  configured(): boolean;
  generate(input: GenerateInput): Promise<GenerateResult>;
  health(): Promise<ProviderHealth>;
}

export class AiProviderError extends Error {
  readonly status: number;
  readonly provider: string;

  constructor(provider: string, message: string, status = 502) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = provider;
    this.status = status;
  }
}