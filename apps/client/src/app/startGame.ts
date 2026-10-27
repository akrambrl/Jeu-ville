import Phaser from 'phaser';
import { MOVEMENT, getDistrictMap, type CharacterSelf } from '@jeu-ville/shared';
import { CityScene, type CitySceneData } from '../game/CityScene.js';
import type { DistrictLink } from '../net/link.js';
import { el } from '../ui/dom.js';
import { Hud } from '../ui/hud.js';
import { showTutorialOnce } from '../ui/tutorial.js';

export function showFatal(ui: HTMLElement, message: string, retry: () => void): void {
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

/** Lance la ville pour un personnage, quel que soit le lien (serveur ou démo locale). */
export function startGame(ui: HTMLElement, character: CharacterSelf, link: DistrictLink): void {
  const map = getDistrictMap(character.districtId);
  if (!map) return showFatal(ui, 'Quartier inconnu.', () => location.reload());

  const scene = new CityScene();
  let homeDoor = character.home?.door ?? null;

  const hud = new Hud(ui, {
    onGoHome: () => homeDoor && scene.requestMove(homeDoor),
    onHomeAction: (action) => link.homeAction(action),
    onRecenter: () => scene.recenter(),
  });
  hud.setSelf(character);

  link.onSelf((self) => {
    homeDoor = self.home?.door ?? null;
    hud.setSelf(self);
  });
  link.onNotice((n) => hud.notify(n.text, n.level));
  link.onDisconnected(() => showFatal(ui, 'Déconnecté du serveur.', () => location.reload()));

  const sceneData: CitySceneData = {
    map,
    link,
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
