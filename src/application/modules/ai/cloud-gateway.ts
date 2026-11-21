import { freemem } from 'node:os';

export type CloudAiProvider = 'gemini-cloud' | 'groq-cloud';

export class CloudAiGatewayError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
    this.name = 'CloudAiGatewayError';
  }
}

export interface CloudAiConfiguration {
  geminiApiKey: string;
  groqApiKey: string | null;
  geminiModel: string;
  geminiLiteModel: string;
  groqModel: string;
}

export interface AiGenerationResult {
  answer: string;
  model: string;
  provider: 'ollama-local' | CloudAiProvider;
  fallbackUsed?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const FREE_GIB = 1024 ** 3;
const LOCAL_AI_MIN_FREE_RAM_GIB = 2.5;

function readModel(value: string | undefined, fallback: string): string {
  const model = value?.trim() || fallback;
  if (model.length > 120 || !/^[A-Za-z0-9._/-]+$/.test(model)) {
    throw new CloudAiGatewayError('Identifiant de modèle cloud invalide.', 500);
  }
  return model;
}

export function resolveAggregateCloudConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): CloudAiConfiguration | null {
  if (env.SAFE_ERP_AI_CLOUD_ENABLED !== 'true'
    || env.SAFE_ERP_AI_CLOUD_CONSENT_AGGREGATES !== 'true') return null;

  const geminiApiKey = env.GEMINI_API_KEY?.trim() || null;
  const groqApiKey = env.GROQ_API_KEY?.trim() || null;
  if (!geminiApiKey) return null;
  return {
    geminiApiKey,
    groqApiKey,
    geminiModel: readModel(env.SAFE_ERP_AI_GEMINI_MODEL, 'gemini-3.8-flash'),
    geminiLiteModel: readModel(env.SAFE_ERP_AI_GEMINI_LITE_MODEL, 'gemini-3.5-flash-lite'),
    groqModel: readModel(env.SAFE_ERP_AI_GROQ_MODEL, 'llama-3.3-70b-versatile'),
  };
}

async function requestGemini(
  prompt: string,
  configuration: CloudAiConfiguration,
  timeoutMs: number,
  lite: boolean,
): Promise<AiGenerationResult> {
  const model = lite ? configuration.geminiLiteModel : configuration.geminiModel;
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'x-goog-api-key': configuration.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch {
    throw new CloudAiGatewayError('Impossible de joindre Gemini.', 502);
  }
  if (!response.ok) throw new CloudAiGatewayError(`Gemini a répondu HTTP ${response.status}.`, response.status);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('candidates' in payload) || !Array.isArray(payload.candidates)) {
    throw new CloudAiGatewayError('La réponse Gemini est invalide.', 502);
  }
  const first = payload.candidates[0];
  if (!first || typeof first !== 'object' || !('content' in first)
    || !first.content || typeof first.content !== 'object' || !('parts' in first.content)
    || !Array.isArray(first.content.parts)) {
    throw new CloudAiGatewayError('Gemini n’a pas fourni de réponse exploitable.', 502);
  }
  const answer = first.content.parts
    .filter((part): part is { text: string } => Boolean(part) && typeof part === 'object'
      && 'text' in part && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
  if (!answer) throw new CloudAiGatewayError('La réponse Gemini est vide.', 502);
  return { answer, model, provider: 'gemini-cloud' };
}

async function requestGroq(
  prompt: string,
  configuration: CloudAiConfiguration,
  timeoutMs: number,
): Promise<AiGenerationResult> {
  if (!configuration.groqApiKey) throw new CloudAiGatewayError('La clé Groq de secours est absente.', 503);
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${configuration.groqApiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        model: configuration.groqModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CloudAiGatewayError('Impossible de joindre Groq.', 502);
  }
  if (!response.ok) throw new CloudAiGatewayError(`Groq a répondu HTTP ${response.status}.`, response.status);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray(payload.choices)) {
    throw new CloudAiGatewayError('La réponse Groq est invalide.', 502);
  }
  const first = payload.choices[0];
  if (!first || typeof first !== 'object' || !('message' in first)
    || !first.message || typeof first.message !== 'object' || !('content' in first.message)
    || typeof first.message.content !== 'string' || !first.message.content.trim()) {
    throw new CloudAiGatewayError('Groq n’a pas fourni de réponse exploitable.', 502);
  }
  return {
    answer: first.message.content.trim(),
    model: configuration.groqModel,
    provider: 'groq-cloud',
    fallbackUsed: true,
  };
}

export async function generateAggregateCloudText(
  prompt: string,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number; isLiteTask?: boolean } = {},
): Promise<AiGenerationResult> {
  const configuration = resolveAggregateCloudConfiguration(options.env);
  if (!configuration) throw new CloudAiGatewayError('Cloud désactivé : opt-in agrégé ou clé fournisseur absent.', 403);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let primaryError: unknown;
  try {
    return await requestGemini(prompt, configuration, timeoutMs, options.isLiteTask ?? false);
  } catch (error) {
    primaryError = error;
  }
  if (configuration.groqApiKey) {
    try {
      return await requestGroq(prompt, configuration, timeoutMs);
    } catch (error) {
      if (primaryError instanceof CloudAiGatewayError) {
        throw new CloudAiGatewayError(`${primaryError.message} Le fournisseur de secours Groq a également échoué.`, 503);
      }
      throw error;
    }
  }
  if (primaryError instanceof CloudAiGatewayError) throw primaryError;
  throw new CloudAiGatewayError('Gemini n’a pas pu générer de réponse agrégée.', 503);
}

export async function generateAggregateWithLocalFallback(
  localPrompt: string,
  cloudPrompt: string | null,
  options: {
    env?: NodeJS.ProcessEnv;
    freeRamGiB?: number;
    generateLocal: (prompt: string) => Promise<AiGenerationResult>;
    generateCloud?: (prompt: string) => Promise<AiGenerationResult>;
  },
): Promise<AiGenerationResult> {
  let cloudConfigured = false;
  if (cloudPrompt !== null) {
    try {
      cloudConfigured = Boolean(resolveAggregateCloudConfiguration(options.env));
    } catch {
      cloudConfigured = false;
    }
  }
  const generateCloud = options.generateCloud ?? ((prompt) => generateAggregateCloudText(prompt, { env: options.env }));
  const freeRamGiB = options.freeRamGiB ?? freemem() / FREE_GIB;

  if (cloudConfigured && freeRamGiB < LOCAL_AI_MIN_FREE_RAM_GIB) {
    try {
      return await generateCloud(cloudPrompt);
    } catch {
      return { ...(await options.generateLocal(localPrompt)), fallbackUsed: true };
    }
  }
  try {
    return await options.generateLocal(localPrompt);
  } catch (localError) {
    if (!cloudConfigured) throw localError;
    try {
      return { ...(await generateCloud(cloudPrompt)), fallbackUsed: true };
    } catch {
      throw localError;
    }
  }
}
