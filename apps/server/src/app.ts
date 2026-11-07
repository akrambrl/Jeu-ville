import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_CARDS } from '@jeu-ville/shared';
import { registerRoutes } from './api/routes.js';
import type { Db } from './db/client.js';
import { CardRoom } from './rooms/CardRoom.js';

/**
 * Monte l'API REST (Fastify) et le temps réel (Colyseus) sur le même serveur HTTP.
 * En ligne (`staticDir`), il sert aussi le jeu lui-même : une seule adresse à partager.
 */
export async function buildServer(db: Db, options: { clientOrigin: string; logger?: boolean; staticDir?: string | null }) {
  const app = Fastify({ logger: options.logger ?? true });
  // Le jeu web (CLIENT_ORIGIN, plusieurs adresses séparées par des virgules) et l'appli
  // native (Capacitor : capacitor://localhost sur iPhone, https://localhost sur Android).
  const origins = [...options.clientOrigin.split(',').map((o) => o.trim()).filter(Boolean), ...NATIVE_APP_ORIGINS];
  await app.register(cors, { origin: origins });
  registerRoutes(app, db);
  if (options.staticDir) await app.register(fastifyStatic, { root: options.staticDir, prefix: '/' });
  await app.ready();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: app.server }),
    greet: false,
  });
  // Une room = une table ; joinOrCreate remplit les tables qui attendent des joueurs.
  gameServer.define(ROOM_CARDS, CardRoom);

  return { app, gameServer };
}

/** Origines des pages de l'appli native (Capacitor). */
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
