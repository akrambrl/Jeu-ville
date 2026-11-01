import { Client } from 'colyseus.js';
import { ROOM_HIDE_SEEK, type CharacterSelf, type HideSeekJoinOptions } from '@jeu-ville/shared';
import { showFatal } from './app/startGame.js';
import { startHideSeek } from './app/startHideSeek.js';
import { ApiError, SERVER_URL, api, tokenStore } from './net/api.js';
import { ColyseusHideSeekLink } from './net/hideSeekLink.js';
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
    // Le personnage (pseudo, apparence) sert d'avatar dans le cache-cache.
    await ensureCharacter();
    const client = new Client(SERVER_URL);
    const room = await client.joinOrCreate(ROOM_HIDE_SEEK, { token: tokenStore.get()! } satisfies HideSeekJoinOptions);
    startHideSeek(ui, new ColyseusHideSeekLink(room));
  } catch (err) {
    showFatal(ui, (err as Error).message, () => void start());
  }
}

void start();
