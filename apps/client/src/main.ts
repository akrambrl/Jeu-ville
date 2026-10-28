import { Client } from 'colyseus.js';
import { ROOM_CHAT, ROOM_DISTRICT, type CharacterSelf, type ChatJoinOptions, type DistrictJoinOptions } from '@jeu-ville/shared';
import { showFatal, startGame } from './app/startGame.js';
import { ApiError, SERVER_URL, api, tokenStore } from './net/api.js';
import { ColyseusChat } from './net/chat.js';
import { ColyseusLink } from './net/colyseusLink.js';
import { showCreationScreen } from './ui/creationScreen.js';
import { showLoginScreen } from './ui/loginScreen.js';
import './ui/styles.css';

const ui = document.getElementById('ui')!;

/** Session valide + personnage existant (sinon on passe par les écrans d'accueil). */
async function ensureCharacter(): Promise<CharacterSelf> {
  for (;;) {
    if (!tokenStore.get()) {
      await showLoginScreen(ui, async (pseudo) => {
        tokenStore.set((await api.createSession(pseudo)).token);
      });
    }
    try {
      const me = await api.me();
      return me.character ?? (await showCreationScreen(ui, me.pseudo, api.createCharacter));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        continue;
      }
      throw err;
    }
  }
}

async function start(): Promise<void> {
  try {
    const character = await ensureCharacter();
    const client = new Client(SERVER_URL);
    const room = await client.joinOrCreate(ROOM_DISTRICT, {
      token: tokenStore.get()!,
      districtId: character.districtId,
    } satisfies DistrictJoinOptions);
    // Le chat est un plus : s'il ne répond pas, on joue quand même.
    const chatRoom = await client.joinOrCreate(ROOM_CHAT, { token: tokenStore.get()! } satisfies ChatJoinOptions).catch((err: Error) => {
      console.warn('Chat indisponible :', err.message);
      return null;
    });
    startGame(ui, character, new ColyseusLink(room), () => (chatRoom ? new ColyseusChat(chatRoom, character.id) : null));
  } catch (err) {
    showFatal(ui, (err as Error).message, () => void start());
  }
}

void start();
