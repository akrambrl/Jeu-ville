import cors from '@fastify/cors';
import Fastify from 'fastify';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_CHAT, ROOM_DISTRICT } from '@jeu-ville/shared';
import { registerRoutes } from './api/routes.js';
import type { Db } from './db/client.js';
import { ChatRoom } from './rooms/ChatRoom.js';
import { DistrictRoom } from './rooms/DistrictRoom.js';

/** Monte l'API REST (Fastify) et le temps réel (Colyseus) sur le même serveur HTTP. */
export async function buildServer(db: Db, options: { clientOrigin: string; logger?: boolean }) {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: options.clientOrigin });
  registerRoutes(app, db);
  await app.ready();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: app.server }),
    greet: false,
  });
  gameServer.define(ROOM_DISTRICT, DistrictRoom).filterBy(['districtId']);
  gameServer.define(ROOM_CHAT, ChatRoom);

  return { app, gameServer };
}
