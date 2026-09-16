import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';

export type GeminiJsonOptions = {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

function getClient() {
  const config = env();
  if (!config.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  return new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
}

export async function generateGeminiText(
  prompt: string,
  options: GeminiJsonOptions = {},
): Promise<string> {
  const config = env();
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: prompt,
    config: {
      ...(options.systemInstruction
        ? { systemInstruction: options.systemInstruction }
        : {}),
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
}

export async function generateGeminiJson<T>(
  prompt: string,
  options: GeminiJsonOptions = {},
): Promise<T> {
  const config = env();
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      ...(options.systemInstruction
        ? { systemInstruction: options.systemInstruction }
        : {}),
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty JSON response');
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }
}
