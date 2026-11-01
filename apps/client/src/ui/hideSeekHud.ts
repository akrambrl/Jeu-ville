/** Interface du cache-cache : minuteur, rôle, compteur de cachés, actions, salon et résultats. */
import { HIDE_SEEK } from '@jeu-ville/shared';
import type { HideSeekSnapshot, RosterView } from '../net/hideSeekLink.js';
import { el } from './dom.js';

/** Durée d'affichage d'une ligne du fil des événements (ms). */
const FEED_MS = 6_000;
const FEED_MAX = 4;
const TOAST_MS = 2_600;

export interface HideSeekHudActions {
  leaveSpot: () => void;
  recenter: () => void;
}

/** Ce que le HUD doit savoir en plus de l'état de la partie. */
export interface HudContext {
  me: RosterView | undefined;
  /** Caché dans une cachette (nom de la cachette), sinon null. */
  hiddenIn: string | null;
  /** Prochaine fouille possible (ms, horloge locale). */
  searchReadyAt: number;
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class HideSeekHud {
  readonly root: HTMLElement;
  private readonly phaseLabel = el('span', { class: 'hs-phase' });
  private readonly timer = el('span', { class: 'hs-timer' });
  private readonly counter = el('span', { class: 'hs-counter' });
  private readonly role = el('div', { class: 'hs-role' });
  private readonly tip = el('div', { class: 'hs-tip' });
  private readonly leaveButton = el('button', { class: 'primary hs-leave', text: '🚪 Sortir de la cachette' });
  private readonly cooldown = el('div', { class: 'hs-cooldown' });
  private readonly lobby = el('div', { class: 'hs-lobby' });
  private readonly blindfold = el('div', { class: 'hs-blindfold' });
  private readonly results = el('div', { class: 'hs-results' });
  private readonly feedList = el('div', { class: 'hs-feed' });
  private readonly toastBox = el('div', { class: 'hs-toast' });
  private toastTimer = 0;
  private state: HideSeekSnapshot | null = null;
  private ctx: HudContext = { me: undefined, hiddenIn: null, searchReadyAt: 0 };

  constructor(container: HTMLElement, actions: HideSeekHudActions, arenaName: string) {
    const recenter = el('button', { class: 'hs-recenter', title: 'Recentrer', text: '🎯' });
    recenter.addEventListener('click', actions.recenter);
    this.leaveButton.addEventListener('click', actions.leaveSpot);
    const attribution = el('div', { class: 'attribution' }, [
      'Carte : ',
      el('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', text: '© les contributeurs d’OpenStreetMap' }),
      ' · 3D : ',
      el('a', { href: 'https://www.kenney.nl', target: '_blank', rel: 'noopener', text: 'Kenney' }),
      ', ',
      el('a', { href: 'https://quaternius.com', target: '_blank', rel: 'noopener', text: 'Quaternius' }),
    ]);
    this.root = el('div', { class: 'hs-hud' }, [
      el('div', { class: 'hs-top' }, [
        el('div', { class: 'hs-bar' }, [this.phaseLabel, this.timer, this.counter]),
        this.role,
        el('div', { class: 'hs-arena', text: `📍 ${arenaName}` }),
      ]),
      this.lobby,
      this.feedList,
      el('div', { class: 'hs-bottom' }, [this.tip, this.cooldown, this.leaveButton]),
      recenter,
      this.blindfold,
      this.results,
      this.toastBox,
      attribution,
    ]);
    container.append(this.root);
    window.setInterval(() => this.renderCooldown(), 250);
    this.render();
  }

  update(state: HideSeekSnapshot, ctx: HudContext): void {
    this.state = state;
    this.ctx = ctx;
    this.render();
  }

  /** Ligne dans le fil des événements (en haut à droite). */
  feed(text: string): void {
    const line = el('div', { class: 'hs-feed-line', text });
    this.feedList.prepend(line);
    while (this.feedList.children.length > FEED_MAX) this.feedList.lastElementChild?.remove();
    window.setTimeout(() => line.remove(), FEED_MS);
  }

  /** Message bref au milieu de l'écran. */
  toast(text: string, level: 'info' | 'error' | 'big' = 'info'): void {
    this.toastBox.textContent = text;
    this.toastBox.className = `hs-toast show ${level}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastBox.className = 'hs-toast'), level === 'big' ? TOAST_MS * 1.6 : TOAST_MS);
  }

  private render(): void {
    const s = this.state;
    const me = this.ctx.me;
    if (!s) {
      this.phaseLabel.textContent = 'Connexion…';
      return;
    }
    const running = s.phase === 'hiding' || s.phase === 'seeking';
    this.phaseLabel.textContent = PHASE_LABELS[s.phase];
    this.timer.textContent = s.phase === 'lobby' && s.remainingS === 0 ? '' : formatTime(s.remainingS);
    this.timer.classList.toggle('urgent', running && s.remainingS <= 10);
    this.counter.hidden = !running && s.phase !== 'ended';
    this.counter.textContent = `🙈 ${s.hidersAlive}/${s.hidersTotal}`;

    const playing = me?.status === 'playing';
    const hider = playing && me?.role === 'hider';
    const seeker = playing && me?.role === 'seeker';
    this.role.className = `hs-role ${hider ? 'hider' : seeker ? 'seeker' : 'spectator'}`;
    this.role.textContent = !me
      ? ''
      : s.phase === 'lobby'
        ? '⏳ Salon'
        : hider
          ? this.ctx.hiddenIn
            ? `🙈 Caché · ${this.ctx.hiddenIn}`
            : '🙈 Tu te caches'
          : seeker
            ? '🔦 Tu cherches'
            : me.status === 'eliminated'
              ? '👀 Éliminé · spectateur'
              : '👀 Spectateur';
    this.role.hidden = !me || s.phase === 'ended';

    this.tip.textContent = this.tipText(s, hider, seeker);
    this.leaveButton.hidden = !(hider && this.ctx.hiddenIn);
    this.cooldown.hidden = !(seeker && s.phase === 'seeking');

    // Salon : prochaine partie.
    const humans = s.roster.filter((r) => !r.bot).length;
    this.lobby.hidden = s.phase !== 'lobby';
    this.lobby.replaceChildren(
      el('strong', { text: s.remainingS > 0 ? `Prochaine partie dans ${s.remainingS} s` : 'En attente de joueurs…' }),
      el('span', { text: `${humans} joueur${humans > 1 ? 's' : ''} connecté${humans > 1 ? 's' : ''} · les bots complètent les chercheurs` }),
    );

    // Chercheur pendant la première minute : yeux bandés.
    const blind = seeker && s.phase === 'hiding';
    this.blindfold.hidden = !blind;
    if (blind) {
      this.blindfold.replaceChildren(
        el('div', { class: 'hs-blind-icon', text: '🙈' }),
        el('h1', { text: 'Tu comptes, les yeux fermés…' }),
        el('div', { class: 'hs-blind-count', text: String(s.remainingS) }),
        el('p', { text: 'Les cachés courent se cacher. Tu pourras chercher dans un instant.' }),
      );
    }

    // Résultats.
    this.results.hidden = s.phase !== 'ended';
    if (s.phase === 'ended') this.renderResults(s);
    this.renderCooldown();
  }

  private tipText(s: HideSeekSnapshot, hider: boolean, seeker: boolean): string {
    if (s.phase === 'lobby') return 'Balade-toi en attendant : repère les poubelles, voitures, halls, escaliers et parkings.';
    if (hider && this.ctx.hiddenIn) return s.phase === 'hiding' ? 'Bien caché ! Ne bouge plus.' : 'Ne bouge pas… un indice sonore trahit un caché chaque minute.';
    if (hider) return s.phase === 'hiding' ? 'Vite ! Touche une cachette pour t’y glisser.' : 'À découvert, un chercheur qui te voit t’élimine. Cache-toi !';
    if (seeker) return s.phase === 'seeking' ? 'Touche une cachette pour la fouiller, ou un caché que tu vois pour l’éliminer.' : '';
    if (s.phase === 'hiding' || s.phase === 'seeking') return 'Tu regardes la partie : tu rejoues à la prochaine.';
    return '';
  }

  private renderCooldown(): void {
    if (this.cooldown.hidden) return;
    const left = Math.ceil((this.ctx.searchReadyAt - Date.now()) / 1000);
    this.cooldown.classList.toggle('ready', left <= 0);
    this.cooldown.textContent = left > 0 ? `🔍 Prochaine fouille dans ${left} s` : '🔍 Fouille prête';
  }

  private renderResults(s: HideSeekSnapshot): void {
    const me = this.ctx.me;
    const won = !!me && me.role !== 'none' && ((s.winner === 'hiders' && me.role === 'hider') || (s.winner === 'seekers' && me.role === 'seeker'));
    const seekers = s.roster.filter((r) => r.role === 'seeker');
    const hiders = s.roster.filter((r) => r.role === 'hider');
    const row = (r: RosterView, text: string) =>
      el('li', { class: r.id === me?.id ? 'me' : '' }, [el('span', { text: `${r.bot ? '🤖 ' : ''}${r.name}` }), el('span', { text })]);
    this.results.replaceChildren(
      el('div', { class: 'card' }, [
        el('h1', { text: s.winner === 'hiders' ? '🙈 Les cachés gagnent !' : '🔦 Les chercheurs gagnent !' }),
        el('p', {
          text: me?.role === 'none' || !me ? 'Tu joues à la prochaine partie.' : won ? 'Bravo, ton équipe a gagné 🎉' : 'Perdu… revanche à la prochaine !',
        }),
        el('h2', { text: 'Cachés' }),
        el('ul', {}, hiders.map((r) => row(r, r.status === 'playing' ? '✅ a tenu' : '❌ trouvé'))),
        el('h2', { text: 'Chercheurs' }),
        el('ul', {}, seekers.map((r) => row(r, `${r.found} trouvé${r.found > 1 ? 's' : ''}`))),
        el('p', { class: 'hs-next', text: `Nouvelle partie dans ${s.remainingS + HIDE_SEEK.phases.lobbyMs / 1000} s` }),
      ]),
    );
  }
}

const PHASE_LABELS: Record<HideSeekSnapshot['phase'], string> = {
  lobby: '⏳ Salon',
  hiding: '🙈 Cachez-vous !',
  seeking: '🔦 Recherche',
  ended: '🏁 Fin',
};

/** Petit « bip bip » pour l'indice sonore, à gauche ou à droite selon où il a lieu. */
export function playHintSound(pan: number): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(ctx.destination);
    for (const [k, freq] of [880, 660, 880].entries()) {
      const t = ctx.currentTime + k * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(panner);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  } catch {
    /* pas de son disponible : l'indice reste visible */
  }
}

let audio: AudioContext | null = null;
