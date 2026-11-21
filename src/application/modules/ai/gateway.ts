export type AiProviderId = 'ollama-local';

export class LocalAiGatewayError extends Error {
  constructor(message: string, readonly status = 503) {
    super(message);
    this.name = 'LocalAiGatewayError';
  }
}

export interface LocalAiGenerationOptions {
  format?: 'json';
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export function resolveFinancialInsightsProvider(configuredProvider: string | undefined): AiProviderId | null {
  const provider = configuredProvider?.trim();
  if (!provider || provider === 'ollama-local') return 'ollama-local';
  return null;
}

function getLocalOllamaUrl(): URL {
  const rawUrl = process.env.SAFE_ERP_AI_OLLAMA_URL ?? 'http://127.0.0.1:11434';
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new LocalAiGatewayError('URL Ollama locale invalide.');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (
    url.protocol !== 'http:'
    || !loopbackHosts.has(url.hostname)
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new LocalAiGatewayError('Ollama doit être configuré sur la machine locale, sans identifiant ni redirection distante.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/generate`;
  return url;
}

export function assertLocalOllamaEndpoint(): void {
  getLocalOllamaUrl();
}

export function assertLocalAiReady(): string {
  if (process.env.SAFE_ERP_AI_ENABLED !== 'true') {
    throw new LocalAiGatewayError('Assistant IA désactivé. Activez explicitement SAFE_ERP_AI_ENABLED après configuration locale.');
  }
  if (resolveFinancialInsightsProvider(process.env.SAFE_ERP_AI_PROVIDER) !== 'ollama-local') {
    throw new LocalAiGatewayError('Seul le fournisseur Ollama local est pris en charge. Aucun basculement cloud n’est autorisé.');
  }
  if (process.env.SAFE_ERP_AI_HARDWARE_READY !== 'true') {
    throw new LocalAiGatewayError('Assistant IA désactivé : la capacité matérielle doit être vérifiée et approuvée explicitement.');
  }
  if (process.env.SAFE_ERP_AI_MODEL_APPROVED !== 'true') {
    throw new LocalAiGatewayError('Assistant IA désactivé : le modèle doit être évalué et approuvé explicitement.');
  }
  const model = process.env.SAFE_ERP_AI_MODEL?.trim();
  if (!model || model.length > 100) {
    throw new LocalAiGatewayError('Configurez SAFE_ERP_AI_MODEL avec un modèle Ollama local.');
  }
  getLocalOllamaUrl();
  return model;
}

export async function generateLocalAiText(
  prompt: string,
  options: LocalAiGenerationOptions = {},
): Promise<{ answer: string; model: string; provider: AiProviderId }> {
  const model = assertLocalAiReady();

  let response: Response;
  try {
    response = await fetch(getLocalOllamaUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: { temperature: 0.1, num_ctx: 4096, num_predict: 700 },
        ...(options.format ? { format: options.format } : {}),
        prompt,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new LocalAiGatewayError('Le modèle local n’a pas répondu dans le délai autorisé.', 504);
    }
    throw new LocalAiGatewayError('Impossible de joindre le modèle Ollama local. Vérifiez le service configuré.', 502);
  }
  if (!response.ok) {
    throw new LocalAiGatewayError(`Le modèle local a répondu avec le statut HTTP ${response.status}.`, 502);
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object'
    || payload === null
    || !('response' in payload)
    || typeof payload.response !== 'string'
    || !payload.response.trim()
  ) {
    throw new LocalAiGatewayError('La réponse du modèle local est invalide.', 502);
  }
  return { answer: payload.response.trim(), model, provider: 'ollama-local' };
}
