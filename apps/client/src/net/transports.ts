/**
 * Transports temps réel du jeu en ligne (voir packages/shared/src/online) :
 * - Supabase Realtime (le vrai jeu, gratuit, sans serveur à nous) ;
 * - local, entre onglets d'un même navigateur (développement et tests).
 */
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Channel, PresenceMeta, Transport } from '@jeu-ville/shared';

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Développement : `VITE_ONLINE=local` (ou `?online=local`) pour jouer à plusieurs onglets sans Supabase. */
const LOCAL = import.meta.env.VITE_ONLINE === 'local' || new URLSearchParams(location.search).get('online') === 'local';

/** Messages diffusés par seconde et par téléphone, au plus (l'hôte en envoie quelques-uns). */
const EVENTS_PER_SECOND = 20;

/** Le transport à utiliser, ou null si le jeu en ligne n'est pas configuré. */
export function onlineTransport(): Transport | null {
  if (LOCAL) return localTransport();
  if (SUPABASE_URL && SUPABASE_KEY) return supabaseTransport(SUPABASE_URL, SUPABASE_KEY);
  return null;
}

// ---------- Supabase Realtime ----------

function supabaseTransport(url: string, key: string): Transport {
  // Pas de comptes : seul le temps réel sert (aucune donnée stockée chez Supabase).
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: EVENTS_PER_SECOND } },
  });
  return {
    join: (name) =>
      new Promise<Channel>((resolve, reject) => {
        const ch: RealtimeChannel = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } } });
        const handlers = new Map<string, ((p: unknown) => void)[]>();
        const presenceCbs: (() => void)[] = [];
        let meta: PresenceMeta | null = null;
        ch.on('broadcast', { event: '*' }, (msg: { event: string; payload: unknown }) => (handlers.get(msg.event) ?? []).forEach((cb) => cb(msg.payload)));
        ch.on('presence', { event: 'sync' }, () => presenceCbs.forEach((cb) => cb()));
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Réseau revenu : on se réannonce.
            if (meta) void ch.track(meta);
            resolve(channel);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('Connexion au jeu en ligne impossible.'));
        });
        const channel: Channel = {
          send: (type, payload) => void ch.send({ type: 'broadcast', event: type, payload }),
          on: (type, cb) => handlers.set(type, [...(handlers.get(type) ?? []), cb]),
          track: (m) => {
            meta = m;
            void ch.track(m);
          },
          present: () => Object.values(ch.presenceState()).flat() as unknown as PresenceMeta[],
          onPresence: (cb) => presenceCbs.push(cb),
          leave: () => void supabase.removeChannel(ch),
        };
      }),
  };
}

// ---------- Local (onglets d'un même navigateur) ----------

/** Présence locale : on se réannonce régulièrement, et l'on disparaît si l'on se tait. */
const LOCAL_HEARTBEAT_MS = 1_000;
const LOCAL_PRESENCE_TTL_MS = 3_500;

function localTransport(): Transport {
  return {
    join: async (name) => {
      const bc = new BroadcastChannel(`bac-bataille:${name}`);
      const me = crypto.randomUUID();
      const handlers = new Map<string, ((p: unknown) => void)[]>();
      const presenceCbs: (() => void)[] = [];
      const others = new Map<string, { meta: PresenceMeta; at: number }>();
      let meta: PresenceMeta | null = null;
      const announce = () => meta && bc.postMessage({ kind: 'presence', from: me, meta });
      bc.onmessage = (e: MessageEvent<{ kind: string; from: string; type?: string; payload?: unknown; meta?: PresenceMeta }>) => {
        const m = e.data;
        if (m.kind === 'presence' && m.meta) {
          const isNew = !others.has(m.from);
          others.set(m.from, { meta: m.meta, at: Date.now() });
          if (isNew) {
            announce();
            presenceCbs.forEach((cb) => cb());
          }
        } else if (m.kind === 'bye') {
          others.delete(m.from);
          presenceCbs.forEach((cb) => cb());
        } else if (m.kind === 'msg' && m.type) (handlers.get(m.type) ?? []).forEach((cb) => cb(m.payload));
      };
      const timer = window.setInterval(() => {
        announce();
        const now = Date.now();
        for (const [k, v] of others) if (now - v.at > LOCAL_PRESENCE_TTL_MS) others.delete(k);
      }, LOCAL_HEARTBEAT_MS);
      return {
        send: (type, payload) => bc.postMessage({ kind: 'msg', from: me, type, payload }),
        on: (type, cb) => handlers.set(type, [...(handlers.get(type) ?? []), cb]),
        track: (m) => {
          meta = m;
          announce();
        },
        present: () => [...(meta ? [meta] : []), ...[...others.values()].map((o) => o.meta)],
        onPresence: (cb) => presenceCbs.push(cb),
        leave: () => {
          window.clearInterval(timer);
          bc.postMessage({ kind: 'bye', from: me });
          bc.close();
        },
      };
    },
  };
}
