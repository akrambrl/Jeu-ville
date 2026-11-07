import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { clientErrorSchema, createSessionSchema, type MeResponse } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { createSession, deletePlayer, playerFromToken, type AuthenticatedPlayer } from '../domain/auth.js';
import { GameError } from '../domain/errors.js';

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

async function requirePlayer(db: Db, req: FastifyRequest): Promise<AuthenticatedPlayer> {
  const token = bearerToken(req);
  const player = token ? await playerFromToken(db, token) : null;
  if (!player) throw new GameError('Session invalide, reconnecte-toi.', 401);
  return player;
}

export function registerRoutes(app: FastifyInstance, db: Db): void {
  app.setErrorHandler((err, _req, reply: FastifyReply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof z.ZodError) {
      return reply.status(400).send({ error: err.issues[0]?.message ?? 'Requête invalide.' });
    }
    app.log.error(err);
    return reply.status(500).send({ error: 'Erreur serveur.' });
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/session', async (req) => {
    const { pseudo } = createSessionSchema.parse(req.body);
    return createSession(db, pseudo);
  });

  app.get('/api/me', async (req): Promise<MeResponse> => {
    const player = await requirePlayer(db, req);
    return { playerId: player.id, pseudo: player.pseudo };
  });

  // Suppression du compte depuis l'appli (exigée par Apple et Google, et par le RGPD).
  app.delete('/api/me', async (req, reply) => {
    const player = await requirePlayer(db, req);
    await deletePlayer(db, player.id);
    return reply.status(204).send();
  });

  // Plantages côté joueurs : simplement journalisés (aucune donnée personnelle).
  app.post('/api/errors', async (req, reply) => {
    const parsed = clientErrorSchema.safeParse(req.body);
    if (parsed.success && errorBudget.take()) app.log.warn({ clientError: parsed.data }, 'Erreur côté joueur');
    return reply.status(204).send();
  });
}

/** Au plus tant d'erreurs de joueurs journalisées par minute (contre l'inondation des journaux). */
const CLIENT_ERRORS_PER_MINUTE = 60;

const errorBudget = {
  windowStart: 0,
  count: 0,
  take(now = Date.now()): boolean {
    if (now - this.windowStart > 60_000) [this.windowStart, this.count] = [now, 0];
    this.count += 1;
    return this.count <= CLIENT_ERRORS_PER_MINUTE;
  },
};
