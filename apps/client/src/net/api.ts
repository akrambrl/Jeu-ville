import type { ClientErrorReport, MeResponse, SessionResponse } from '@jeu-ville/shared';

/**
 * URL du serveur de jeu. En ligne, le serveur sert aussi le jeu : même adresse
 * que la page. En développement : même hôte, port 2567.
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? location.origin : `${location.protocol}//${location.hostname}:2567`);

const TOKEN_KEY = 'bac-bataille.token';

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
  /** Supprime définitivement le compte en ligne (pseudo compris). */
  deleteMe: () => request<void>('DELETE', '/api/me'),
};

/** Version du jeu envoyée avec les rapports d'erreurs. */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev';
/** Au plus tant de rapports d'erreurs par session (une boucle d'erreurs n'inonde pas le serveur). */
const MAX_ERROR_REPORTS = 5;
let errorReports = 0;

/** Envoie un rapport de plantage au serveur (sans donnée personnelle), sans jamais gêner le jeu. */
export function reportError(message: string, stack?: string, where?: string): void {
  if (errorReports >= MAX_ERROR_REPORTS) return;
  errorReports += 1;
  const body: ClientErrorReport = { message: message.slice(0, 500), stack: stack?.slice(0, 4000), where: where?.slice(0, 200), version: APP_VERSION };
  void fetch(`${SERVER_URL}/api/errors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
}

/** Remonte les erreurs non rattrapées (jeu en ligne seulement : la version autonome n'a pas de serveur). */
export function installErrorReporting(): void {
  window.addEventListener('error', (e) => reportError(String(e.message), (e.error as Error | undefined)?.stack, `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason as Error | undefined;
    reportError(String(err?.message ?? e.reason), err?.stack, 'promise');
  });
}
