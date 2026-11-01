/** Lance le cache-cache (serveur ou démo locale) : vue 3D du quartier, cachettes, HUD. */
import { HIDE_SEEK, HIDING_SPOT_LABELS, getArena, hidingSpots, type HideSeekEvent, type TilePoint } from '@jeu-ville/shared';
import type { HideSeekLink, HideSeekSnapshot, RosterView } from '../net/hideSeekLink.js';
import { HideSeekHud, playHintSound } from '../ui/hideSeekHud.js';
import { el } from '../ui/dom.js';
import { CityView } from '../world/CityView.js';
import { HidingSpotLayer } from '../world/hidingSpots.js';
import { showFatal } from './startGame.js';

export function startHideSeek(ui: HTMLElement, link: HideSeekLink): void {
  const { map, start } = getArena();
  // Mêmes cachettes que sur le serveur (calcul déterministe depuis la carte).
  const spots = hidingSpots(map, start);
  const spotById = new Map(spots.map((s) => [s.id, s]));

  let state: HideSeekSnapshot | null = null;
  let me: RosterView | undefined;
  let position: TilePoint | null = null;
  let hiddenIn: string | null = null;
  let searchReadyAt = 0;
  /** Cachette touchée de loin : on y va, puis on agit en arrivant. */
  let pending: { spotId: string; action: 'hide' | 'search' } | null = null;

  const playing = () => me?.status === 'playing';
  const isHider = () => playing() && me?.role === 'hider';
  const isSeeker = () => playing() && me?.role === 'seeker';
  const distTo = (p: TilePoint) => (position ? Math.hypot(position.x - p.x, position.y - p.y) : Infinity);

  const act = (spotId: string, action: 'hide' | 'search') => {
    if (action === 'hide') link.hide(spotId);
    else link.search(spotId);
  };

  const tapSpot = (spotId: string) => {
    const spot = spotById.get(spotId);
    if (!spot || !state) return;
    const label = HIDING_SPOT_LABELS[spot.kind];
    const running = state.phase === 'hiding' || state.phase === 'seeking';
    if (isHider() && running) {
      if (hiddenIn) return hud.toast('Sors d’abord de ta cachette.', 'error');
      if (distTo(spot) <= HIDE_SEEK.enterRange) return act(spotId, 'hide');
      pending = { spotId, action: 'hide' };
      return view.requestMove(spot.access);
    }
    if (isSeeker() && running) {
      if (state.phase === 'hiding') return hud.toast('Yeux fermés ! Attends la fin du compte.', 'error');
      if (distTo(spot) <= HIDE_SEEK.searchRange && Date.now() >= searchReadyAt) return act(spotId, 'search');
      pending = { spotId, action: 'search' };
      if (distTo(spot) > HIDE_SEEK.searchRange) view.requestMove(spot.access);
      return;
    }
    hud.toast(`${label.icon} ${label.name}`);
  };

  const container = document.getElementById('game')!;
  const view: CityView = new CityView(container, {
    map,
    link,
    homeDoor: null,
    onLocalPosition: (x, y) => {
      position = { x, y };
      layer.setSight(isSeeker() && state?.phase === 'seeking' ? position : null);
      if (!pending) return;
      const spot = spotById.get(pending.spotId);
      const range = pending.action === 'hide' ? HIDE_SEEK.enterRange : HIDE_SEEK.searchRange;
      if (spot && distTo(spot) <= range && (pending.action === 'hide' || Date.now() >= searchReadyAt)) {
        act(pending.spotId, pending.action);
        pending = null;
      }
    },
    onPersonTap: (person) => {
      if (person.kind === 'object') return tapSpot(person.id);
      if (person.kind !== 'avatar') return;
      // Chercheur : désigner un caché aperçu (le serveur vérifie qu'il est bien en vue).
      if (isSeeker() && state?.phase === 'seeking') link.tag(person.id);
    },
    onGroundTap: () => {
      pending = null;
    },
    pickables: () => layer.pickables(),
    onFrame: (dt) => layer.update(dt, position),
  });
  const layer = new HidingSpotLayer(spots, (x, y) => view.groundAt(x, y));
  view.addObject(layer.group);

  const hud = new HideSeekHud(
    ui,
    {
      leaveSpot: () => link.leaveSpot(),
      recenter: () => view.recenter(),
    },
    map.districtName,
  );
  const refreshHud = () => {
    if (state) hud.update(state, { me, hiddenIn: hiddenIn ? spotName(hiddenIn) : null, searchReadyAt });
  };
  const spotName = (id: string) => {
    const s = spotById.get(id);
    return s ? HIDING_SPOT_LABELS[s.kind].name : '';
  };

  link.onBodies((bodies) => {
    const self = bodies.find((b) => b.id === link.sessionId);
    const nowHidden = self?.spotId ?? null;
    if (nowHidden !== hiddenIn) {
      hiddenIn = nowHidden;
      pending = null;
      refreshHud();
    }
    const occupants = new Map<string, string>();
    for (const b of bodies) if (b.spotId && b.id !== link.sessionId) occupants.set(b.spotId, b.name);
    layer.setOccupants(occupants, hiddenIn);
  });

  link.onState((s) => {
    const previous = state;
    state = s;
    me = s.roster.find((r) => r.id === link.sessionId);
    if (previous && previous.phase !== s.phase) onPhase(s);
    refreshHud();
  });

  const onPhase = (s: HideSeekSnapshot) => {
    pending = null;
    if (s.phase === 'hiding') {
      searchReadyAt = 0;
      view.recenter();
      if (isHider()) hud.toast('🙈 Tu te caches ! 1 minute pour trouver une cachette.', 'big');
      else if (isSeeker()) hud.toast('🔦 Tu cherches ! Compte jusqu’à 60…', 'big');
    } else if (s.phase === 'seeking') {
      hud.toast(isSeeker() ? '🔦 C’est parti, cherche !' : '🔦 Les chercheurs ouvrent les yeux !', 'big');
    } else if (s.phase === 'lobby') {
      view.recenter();
    }
  };

  link.onEvent((e: HideSeekEvent) => {
    switch (e.kind) {
      case 'searched':
        layer.searched(e.spotId, e.found);
        if (e.byId === link.sessionId) {
          searchReadyAt = Date.now() + HIDE_SEEK.searchCooldownMs;
          if (!e.found) hud.toast(`${spotName(e.spotId)} : personne…`);
          refreshHud();
        }
        break;
      case 'eliminated':
        if (e.id === link.sessionId) {
          hud.toast(e.how === 'search' ? `😱 ${e.by} t’a trouvé ! Tu regardes la fin de la partie.` : `😱 ${e.by} t’a repéré ! Tu regardes la fin de la partie.`, 'big');
        } else {
          hud.feed(e.how === 'search' ? `😱 ${e.name} trouvé par ${e.by}` : `👀 ${e.name} repéré par ${e.by}`);
        }
        break;
      case 'hint': {
        layer.hint({ x: e.x, y: e.y }, e.radius);
        hud.feed('🔊 Un bruit a été entendu !');
        playHintSound(position ? (e.x - position.x) / 10 : 0);
        if (isSeeker()) hud.toast('🔊 Un indice sonore ! Regarde le cercle orange.');
        break;
      }
      case 'left':
        hud.feed(e.replacedBy ? `🚪 ${e.name} est parti, ${e.replacedBy} prend sa place` : `🚪 ${e.name} a quitté la partie`);
        break;
      case 'ended':
      case 'phase':
        break;
    }
  });

  link.onNotice((n) => hud.toast(n.text, n.level));
  link.onDisconnected(() => showFatal(ui, 'Déconnecté du serveur.', () => location.reload()));

  const loading = el('div', { class: 'loading', text: `Chargement du quartier ${map.districtName}…` });
  ui.append(loading);
  view
    .build()
    .catch((err) => showFatal(ui, `Impossible d'afficher le quartier : ${(err as Error).message}`, () => location.reload()))
    .finally(() => loading.remove());
}
