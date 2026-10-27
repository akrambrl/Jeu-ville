import { Client } from 'colyseus.js';
import { ROOM_DISTRICT, type CharacterSelf, type DistrictJoinOptions } from '@jeu-ville/shared';
import { showFatal, startGame } from './app/startGame.js';
import { ApiError, SERVER_URL, api, tokenStore } from './net/api.js';
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
    const room = await new Client(SERVER_URL).joinOrCreate(ROOM_DISTRICT, {
      token: tokenStore.get()!,
      districtId: character.districtId,
    } satisfies DistrictJoinOptions);
    startGame(ui, character, new ColyseusLink(room));
  } catch (err) {
    showFatal(ui, (err as Error).message, () => void start());
  }
}

void start();
