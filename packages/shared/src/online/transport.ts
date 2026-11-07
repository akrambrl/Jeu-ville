/**
 * Transport temps réel entre téléphones, sans serveur à nous : des canaux où
 * l'on diffuse des messages (broadcast) et où l'on voit qui est présent
 * (presence). En vrai : Supabase Realtime (côté client) ; en test : MemoryTransport.
 */

/** Ce que chaque participant annonce sur un canal (presence). */
export type PresenceMeta = Record<string, unknown> & { id: string };

export interface Channel {
  /** Diffuse un message aux AUTRES participants du canal (pas à soi). */
  send(type: string, payload: unknown): void;
  on(type: string, cb: (payload: unknown) => void): void;
  /** Annonce (ou met à jour) sa présence sur le canal. */
  track(meta: PresenceMeta): void;
  /** Participants présents (soi compris). */
  present(): PresenceMeta[];
  onPresence(cb: () => void): void;
  leave(): void;
}

export interface Transport {
  /** Rejoint un canal (résolu une fois abonné). */
  join(name: string): Promise<Channel>;
}

/** Horloge et minuteries injectées (vraies en jeu, manuelles en test). */
export interface Scheduler {
  now(): number;
  every(ms: number, fn: () => void): () => void;
  after(ms: number, fn: () => void): () => void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  every: (ms, fn) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
  after: (ms, fn) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

// ---------- Version en mémoire (tests) ----------

interface MemoryMember {
  key: number;
  meta: PresenceMeta | null;
  handlers: Map<string, ((payload: unknown) => void)[]>;
  presenceCbs: (() => void)[];
}

/**
 * Canaux en mémoire, partagés par plusieurs « téléphones » dans le même
 * processus. Les messages passent par JSON (comme sur le réseau) et peuvent
 * être coupés pour un participant (`cut`) pour simuler une perte de réseau.
 */
export class MemoryTransport {
  private readonly channels = new Map<string, Set<MemoryMember>>();
  private nextKey = 1;

  /** Un « téléphone » : son propre accès au transport. */
  client(): Transport & { cut(on: boolean): void } {
    const mine: { member: MemoryMember; name: string }[] = [];
    let isCut = false;
    const transport = {
      join: async (name: string): Promise<Channel> => {
        const members = this.channels.get(name) ?? new Set<MemoryMember>();
        this.channels.set(name, members);
        const member: MemoryMember = { key: this.nextKey++, meta: null, handlers: new Map(), presenceCbs: [] };
        members.add(member);
        mine.push({ member, name });
        const notifyPresence = () => [...members].forEach((m) => m.presenceCbs.forEach((cb) => cb()));
        return {
          send: (type, payload) => {
            if (isCut || !members.has(member)) return;
            const wire = JSON.stringify(payload);
            for (const m of [...members]) if (m !== member) (m.handlers.get(type) ?? []).forEach((cb) => cb(JSON.parse(wire)));
          },
          on: (type, cb) => member.handlers.set(type, [...(member.handlers.get(type) ?? []), cb]),
          track: (meta) => {
            member.meta = JSON.parse(JSON.stringify(meta)) as PresenceMeta;
            notifyPresence();
          },
          present: () => [...members].filter((m) => m.meta).map((m) => m.meta!),
          onPresence: (cb) => member.presenceCbs.push(cb),
          leave: () => {
            members.delete(member);
            notifyPresence();
          },
        };
      },
      /** Coupe (ou rétablit) le réseau de ce téléphone : il disparaît des présences. */
      cut: (on: boolean) => {
        isCut = on;
        for (const { member, name } of mine) {
          const members = this.channels.get(name)!;
          if (on) members.delete(member);
          else members.add(member);
          [...members, member].forEach((m) => m.presenceCbs.forEach((cb) => cb()));
        }
      },
    };
    return transport;
  }
}

/** Horloge manuelle pour les tests : `advance(ms)` déclenche les minuteries échues, dans l'ordre. */
export class ManualScheduler implements Scheduler {
  private t = 0;
  private timers: { at: number; every: number | null; fn: () => void; id: number }[] = [];
  private nextId = 1;

  now(): number {
    return this.t;
  }

  every(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, every: ms, fn, id });
    return () => (this.timers = this.timers.filter((x) => x.id !== id));
  }

  after(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, every: null, fn, id });
    return () => (this.timers = this.timers.filter((x) => x.id !== id));
  }

  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      this.t = next.at;
      if (next.every) next.at += next.every;
      else this.timers = this.timers.filter((x) => x.id !== next.id);
      next.fn();
    }
    this.t = end;
  }
}
