import {
  HOME_ACTIONS,
  HOME_ACTION_IDS,
  computeHappiness,
  decayGauges,
  isCritical,
  type CharacterSelf,
  type HomeActionId,
  type TilePoint,
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

export interface Destination {
  icon: string;
  name: string;
  /** Type de lieu affiché sous le nom (« Mairie », « Square »…). */
  kind: string;
  point: TilePoint;
}

export interface HudCallbacks {
  onGoHome: () => void;
  onGoTo: (point: TilePoint) => void;
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
  private readonly goToButton: HTMLButtonElement;
  private readonly destinationsPanel: HTMLElement;
  private readonly timer: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: HudCallbacks,
    private readonly destinations: Destination[],
  ) {
    const gauges = el('div', { class: 'hud-card gauges' });
    for (const g of GAUGES) {
      const fill = el('span');
      const bar = el('div', { class: `gauge-bar${g.key === 'happiness' ? ' happiness' : ''}` }, [fill]);
      this.bars.set(g.key, bar);
      gauges.append(el('div', { text: g.label }), bar);
    }

    this.goToButton = el('button', { class: 'primary', text: '📍 Aller à…' });
    this.goToButton.addEventListener('click', () => this.toggleDestinations());
    this.destinationsPanel = this.buildDestinations();
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
      el('div', { class: 'hud-bottom' }, [this.homePanel, this.goToButton, recenter]),
      this.destinationsPanel,
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
  }

  private buildDestinations(): HTMLElement {
    const list = el('div', { class: 'destination-list' });
    const item = (icon: string, name: string, kind: string, go: () => void) => {
      const b = el('button', { class: 'destination' }, [
        el('span', { class: 'destination-icon', text: icon }),
        el('span', { class: 'destination-text' }, [el('strong', { text: name }), el('small', { text: kind })]),
      ]);
      b.addEventListener('click', () => {
        go();
        this.toggleDestinations(false);
      });
      list.append(b);
    };
    item('🏠', 'Chez moi', 'Mon appartement', this.callbacks.onGoHome);
    for (const d of this.destinations) item(d.icon, d.name, d.kind, () => this.callbacks.onGoTo(d.point));

    const close = el('button', { class: 'sheet-close', text: 'Fermer' });
    close.addEventListener('click', () => this.toggleDestinations(false));
    const sheet = el('div', { class: 'sheet' }, [el('h2', { text: 'Aller à…' }), list, close]);
    const backdrop = el('div', { class: 'sheet-backdrop' }, [sheet]);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.toggleDestinations(false);
    });
    backdrop.hidden = true;
    return backdrop;
  }

  private toggleDestinations(open = this.destinationsPanel.hidden): void {
    this.destinationsPanel.hidden = !open;
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
