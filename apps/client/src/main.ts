import Phaser from 'phaser';
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  MOVEMENT,
  ROOM_DISTRICT,
  ServerMessage,
  getDistrictMap,
  type CharacterSelf,
  type DistrictJoinOptions,
  type HomeActionMessage,
  type Notice,
} from '@jeu-ville/shared';
import { ApiError, SERVER_URL, api, tokenStore } from './net/api.js';
import { CityScene, type CitySceneData } from './game/CityScene.js';
import { showCreationScreen } from './ui/creationScreen.js';
import { el } from './ui/dom.js';
import { Hud } from './ui/hud.js';
import { showLoginScreen } from './ui/loginScreen.js';
import { showTutorialOnce } from './ui/tutorial.js';
import './ui/styles.css';

const ui = document.getElementById('ui')!;

/** Session valide + personnage existant (sinon on passe par les écrans d'accueil). */
async function ensureCharacter(): Promise<CharacterSelf> {
  for (;;) {
    if (!tokenStore.get()) await showLoginScreen(ui);
    try {
      const me = await api.me();
      return me.character ?? (await showCreationScreen(ui, me.pseudo));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        tokenStore.clear();
        continue;
      }
      throw err;
    }
  }
}

function showFatal(message: string, retry: () => void): void {
  const button = el('button', { class: 'primary', text: 'Réessayer' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'card' }, [el('h1', { text: 'Oups' }), el('p', { text: message }), el('div', { class: 'actions' }, [button])]),
  ]);
  button.addEventListener('click', () => {
    overlay.remove();
    retry();
  });
  ui.append(overlay);
}

async function start(): Promise<void> {
  let character: CharacterSelf;
  try {
    character = await ensureCharacter();
  } catch (err) {
    return showFatal((err as Error).message, () => void start());
  }

  const map = getDistrictMap(character.districtId);
  if (!map) return showFatal('Quartier inconnu.', () => location.reload());

  let room: Room;
  try {
    const client = new Client(SERVER_URL);
    room = await client.joinOrCreate(ROOM_DISTRICT, {
      token: tokenStore.get()!,
      districtId: character.districtId,
    } satisfies DistrictJoinOptions);
  } catch (err) {
    return showFatal(`Connexion au quartier impossible : ${(err as Error).message}`, () => void start());
  }

  const scene = new CityScene();
  let homeDoor = character.home?.door ?? null;

  const hud = new Hud(ui, {
    onGoHome: () => homeDoor && scene.requestMove(homeDoor),
    onHomeAction: (action) => room.send(ClientMessage.homeAction, { action } satisfies HomeActionMessage),
    onRecenter: () => scene.recenter(),
  });
  hud.setSelf(character);

  room.onMessage(ServerMessage.self, (self: CharacterSelf) => {
    homeDoor = self.home?.door ?? null;
    hud.setSelf(self);
  });
  room.onMessage(ServerMessage.notice, (n: Notice) => hud.notify(n.text, n.level));
  room.onLeave((code) => {
    if (code === 1000) return;
    showFatal('Déconnecté du serveur.', () => location.reload());
  });

  const sceneData: CitySceneData = {
    map,
    room,
    homeDoor,
    onLocalPosition: (x, y) => {
      const near = !!homeDoor && Math.hypot(x - homeDoor.x, y - homeDoor.y) <= MOVEMENT.homeInteractionRange;
      hud.setNearHome(near);
    },
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#a9c98e',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
  });
  game.scene.add('city', scene, true, sceneData);

  showTutorialOnce(ui, map.cityName);
}

void start();
