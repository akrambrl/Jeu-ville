import type { CharacterSelf, CreateCharacterRequest, MeResponse, SessionResponse } from '@jeu-ville/shared';

/**
 * URL du serveur de jeu. En ligne, le serveur sert aussi le jeu : même adresse
 * que la page. En développement : même hôte, port 2567.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? location.origin : `${location.protocol}//${location.hostname}:2567`);

const TOKEN_KEY = 'jeu-ville.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Navigation privée : la session ne survivra pas au rechargement.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* rien */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Serveur injoignable. Réessaie dans un instant.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

export const api = {
  createSession: (pseudo: string) => request<SessionResponse>('POST', '/api/session', { pseudo }),
  me: () => request<MeResponse>('GET', '/api/me'),
  createCharacter: (input: CreateCharacterRequest) => request<CharacterSelf>('POST', '/api/character', input),
};
