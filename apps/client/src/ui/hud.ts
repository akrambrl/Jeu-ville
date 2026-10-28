import {
  HOME_ACTIONS,
  foodMenu,
  HOME_ACTION_IDS,
  TRAVEL,
  computeHappiness,
  decayGauges,
  isCritical,
  type CharacterSelf,
  type HomeActionId,
  type FoodPlace,
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
  /** Catégorie (titre de section dans « Aller à… »). */
  category: string;
  point: TilePoint;
}

export interface HudCallbacks {
  onGoHome: () => void;
  onGoTo: (point: TilePoint) => void;
  /** Y aller en bus (payant), téléporté avec une arrivée en bus. */
  onBusTo: (point: TilePoint) => void;
  onHomeAction: (action: HomeActionId) => void;
  onBuyFood: (placeId: string, itemId: string) => void;
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
  private readonly foodPanel: HTMLElement;
  private foodPlaceId: string | null = null;
  private position: TilePoint = { x: 0, y: 0 };
  private readonly busButtons: { button: HTMLButtonElement; point: () => TilePoint | null }[] = [];
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
    this.foodPanel = el('div', { class: 'home-panel food-panel' });
    this.foodPanel.hidden = true;

    this.root = el('div', {}, [
      el('div', { class: 'hud-top' }, [
        el('div', { class: 'hud-card identity' }, [this.nameEl, this.metaEl, this.moneyEl]),
        gauges,
      ]),
      el('div', { class: 'hud-bottom' }, [this.homePanel, this.foodPanel, this.goToButton, recenter]),
      this.destinationsPanel,
      el('div', { class: 'attribution' }),
    ]);
    const attribution = this.root.querySelector('.attribution')!;
    attribution.append(
      'Carte : ',
      el('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', text: '© les contributeurs d’OpenStreetMap' }),
      ' · 3D : ',
      el('a', { href: 'https://www.kenney.nl', target: '_blank', rel: 'noopener', text: 'Kenney' }),
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

  /** Menu de l'endroit où l'on peut manger (marchand, boulangerie, fast-food, grande surface) à côté du perso. */
  setNearFood(place: FoodPlace | null): void {
    const id = place?.id ?? null;
    if (id === this.foodPlaceId) return;
    this.foodPlaceId = id;
    this.foodPanel.hidden = !place;
    this.foodPanel.replaceChildren();
    if (!place) return;
    for (const item of foodMenu(place.kind)) {
      const b = el('button', { class: 'primary', text: `${item.icon} ${item.label} (${formatMoney(item.costCents)})` });
      b.addEventListener('click', () => this.callbacks.onBuyFood(place.id, item.id));
      this.foodPanel.append(b);
    }
  }

  /** Position du perso (pour griser le bus vers les lieux tout proches). */
  setPosition(x: number, y: number): void {
    this.position = { x, y };
  }

  private buildDestinations(): HTMLElement {
    const list = el('div', { class: 'destination-list' });
    const search = el('input', { class: 'destination-search', type: 'search', placeholder: '🔎 Rechercher un lieu…', 'aria-label': 'Rechercher un lieu' });
    const rows: { row: HTMLElement; text: string; section: HTMLDetailsElement | null }[] = [];

    const row = (icon: string, name: string, kind: string, go: () => void, point: () => TilePoint | null, section: HTMLDetailsElement | null) => {
      const walk = el('button', { class: 'destination', title: 'Y aller à pied (gratuit)' }, [
        el('span', { class: 'destination-icon', text: icon }),
        el('span', { class: 'destination-text' }, [el('strong', { text: name }), el('small', { text: `${kind} · 🚶 à pied` })]),
      ]);
      walk.addEventListener('click', () => {
        go();
        this.toggleDestinations(false);
      });
      const bus = el('button', { class: 'destination-bus', title: `Y aller en bus (${formatMoney(TRAVEL.busFareCents)})`, text: `🚌 ${formatMoney(TRAVEL.busFareCents)}` });
      bus.addEventListener('click', () => {
        const p = point();
        if (!p) return;
        this.callbacks.onBusTo(p);
        this.toggleDestinations(false);
      });
      this.busButtons.push({ button: bus, point });
      const r = el('div', { class: 'destination-row' }, [walk, bus]);
      rows.push({ row: r, text: `${name} ${kind}`.toLowerCase(), section });
      return r;
    };

    list.append(row('🏠', 'Chez moi', 'Mon logement', this.callbacks.onGoHome, () => this.self?.home?.door ?? null, null));
    const sections = new Map<string, HTMLDetailsElement>();
    for (const d of this.destinations) {
      let section = sections.get(d.category);
      if (!section) {
        section = el('details', { class: 'destination-section' }) as HTMLDetailsElement;
        section.append(el('summary', { text: d.category }));
        sections.set(d.category, section);
        list.append(section);
      }
      section.append(row(d.icon, d.name, d.kind, () => this.callbacks.onGoTo(d.point), () => d.point, section));
    }
    for (const [title, section] of sections) {
      const count = section.querySelectorAll('.destination-row').length;
      section.querySelector('summary')!.textContent = `${title} (${count})`;
    }

    // Recherche : on n'affiche que les lieux qui correspondent, sections ouvertes.
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const r of rows) r.row.hidden = q !== '' && !r.text.includes(q);
      for (const section of sections.values()) {
        const visible = [...section.querySelectorAll<HTMLElement>('.destination-row')].some((r) => !r.hidden);
        section.hidden = !visible;
        section.open = q !== '' && visible;
      }
    });

    const close = el('button', { class: 'sheet-close', text: 'Fermer' });
    close.addEventListener('click', () => this.toggleDestinations(false));
    const sheet = el('div', { class: 'sheet' }, [el('h2', { text: 'Aller à…' }), search, list, close]);
    const backdrop = el('div', { class: 'sheet-backdrop' }, [sheet]);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.toggleDestinations(false);
    });
    backdrop.hidden = true;
    return backdrop;
  }

  private toggleDestinations(open = this.destinationsPanel.hidden): void {
    this.destinationsPanel.hidden = !open;
    if (!open) return;
    // Bus inutile pour les lieux tout proches.
    for (const b of this.busButtons) {
      const p = b.point();
      b.button.disabled = !p || Math.hypot(p.x - this.position.x, p.y - this.position.y) < TRAVEL.minBusDistance;
    }
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
