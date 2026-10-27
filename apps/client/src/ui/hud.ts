import {
  HOME_ACTIONS,
  HOME_ACTION_IDS,
  computeHappiness,
  decayGauges,
  isCritical,
  type CharacterSelf,
  type HomeActionId,
} from '@jeu-ville/shared';
import { el, formatMoney, showToast } from './dom.js';

const GAUGES = [
  { key: 'hunger', label: '🍔 Faim' },
  { key: 'hygiene', label: '🚿 Hygiène' },
  { key: 'appearance', label: '👕 Apparence' },
  { key: 'health', label: '❤️ Santé' },
  { key: 'happiness', label: '😊 Bonheur' },
] as const;

/** Rafraîchissement local des jauges entre deux envois du serveur. */
const LOCAL_REFRESH_MS = 5_000;

export interface HudCallbacks {
  onGoHome: () => void;
  onHomeAction: (action: HomeActionId) => void;
  onRecenter: () => void;
}

/** Interface en jeu (DOM par-dessus le canvas). Affiche, ne décide rien. */
export class Hud {
  private readonly root: HTMLElement;
  private self: CharacterSelf | null = null;
  private receivedAt = 0;
  private readonly nameEl = el('div', { class: 'name' });
  private readonly metaEl = el('div', { class: 'meta' });
  private readonly moneyEl = el('div', { class: 'money' });
  private readonly bars = new Map<string, HTMLElement>();
  private readonly homePanel: HTMLElement;
  private readonly goHomeButton: HTMLButtonElement;
  private readonly timer: number;

  constructor(
    private readonly container: HTMLElement,
    callbacks: HudCallbacks,
  ) {
    const gauges = el('div', { class: 'hud-card gauges' });
    for (const g of GAUGES) {
      const fill = el('span');
      const bar = el('div', { class: `gauge-bar${g.key === 'happiness' ? ' happiness' : ''}` }, [fill]);
      this.bars.set(g.key, bar);
      gauges.append(el('div', { text: g.label }), bar);
    }

    this.goHomeButton = el('button', { class: 'primary', text: '🏠 Rentrer chez moi' });
    this.goHomeButton.addEventListener('click', callbacks.onGoHome);
    const recenter = el('button', { text: '🎯', title: 'Recentrer', 'aria-label': 'Recentrer la caméra' });
    recenter.addEventListener('click', callbacks.onRecenter);

    this.homePanel = el('div', { class: 'home-panel' });
    for (const id of HOME_ACTION_IDS) {
      const a = HOME_ACTIONS[id];
      const label = a.costCents > 0 ? `${a.label} (${formatMoney(a.costCents)})` : a.label;
      const b = el('button', { class: 'primary', text: label });
      b.addEventListener('click', () => callbacks.onHomeAction(id));
      this.homePanel.append(b);
    }
    this.homePanel.hidden = true;

    this.root = el('div', {}, [
      el('div', { class: 'hud-top' }, [
        el('div', { class: 'hud-card identity' }, [this.nameEl, this.metaEl, this.moneyEl]),
        gauges,
      ]),
      el('div', { class: 'hud-bottom' }, [this.homePanel, this.goHomeButton, recenter]),
      el('div', { class: 'attribution' }),
    ]);
    const attribution = this.root.querySelector('.attribution')!;
    attribution.append(
      'Carte : ',
      el('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', text: '© les contributeurs d’OpenStreetMap' }),
    );
    container.append(this.root);
    this.timer = window.setInterval(() => this.renderGauges(), LOCAL_REFRESH_MS);
  }

  setSelf(self: CharacterSelf): void {
    this.self = self;
    this.receivedAt = Date.now();
    this.nameEl.textContent = self.name;
    this.metaEl.textContent = `${self.age.years} ans · ${self.home?.buildingName ?? 'Sans logement'}`;
    this.moneyEl.textContent = formatMoney(self.moneyCents);
    this.renderGauges();
  }

  /** Affiche les actions « chez soi » quand le perso est devant sa porte. */
  setNearHome(near: boolean): void {
    if (this.homePanel.hidden === !near) return;
    this.homePanel.hidden = !near;
    this.goHomeButton.hidden = near;
  }

  notify(text: string, level: 'info' | 'error' = 'info'): void {
    showToast(this.container, text, level);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.root.remove();
  }

  private renderGauges(): void {
    if (!this.self) return;
    // Même formule que le serveur : affichage prédictif uniquement.
    const current = decayGauges(this.self.gauges, Date.now() - this.receivedAt);
    const values: Record<string, number> = { ...current, happiness: computeHappiness(current) };
    for (const g of GAUGES) {
      const bar = this.bars.get(g.key)!;
      const v = values[g.key] ?? 0;
      (bar.firstElementChild as HTMLElement).style.width = `${v}%`;
      bar.classList.toggle('critical', g.key !== 'happiness' && isCritical(v));
      bar.title = `${Math.round(v)} / 100`;
    }
  }
}
