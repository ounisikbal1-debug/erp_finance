export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    role: string;
    entityId: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export async function parseLoginResponse(response: Response): Promise<LoginResponse> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw new Error(
      `Le serveur de connexion a renvoyé une réponse non JSON (HTTP ${response.status}). Vérifiez l’URL et le proxy API.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Le serveur de connexion a renvoyé un JSON invalide (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `La connexion a échoué (HTTP ${response.status}).`);
  }

  if (!isRecord(payload) || typeof payload.accessToken !== 'string' || !isRecord(payload.user)) {
    throw new Error('Le profil retourné par le serveur est invalide.');
  }

  const user = payload.user;
  const { id, username, role, entityId } = user;
  if (typeof id !== 'string' || typeof username !== 'string'
    || typeof role !== 'string'
    || !isNullableString(entityId)) {
    throw new Error('Le profil retourné par le serveur est invalide.');
  }

  return {
    accessToken: payload.accessToken,
    user: {
      id,
      username,
      role,
      entityId,
    },
  };
}
