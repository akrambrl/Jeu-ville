import {
  HOME_ACTIONS,
  foodMenu,
  HOME_ACTION_IDS,
  TRAVEL,
  MOVEMENT,
  speedFactor,
  computeHappiness,
  decayGauges,
  isCritical,
  type CharacterSelf,
  type HomeActionId,
  type FoodPlace,
  type ShopPlace,
  type TilePoint,
  type VehicleKind,
  PETS,
  VEHICLES,
  hasBattery,
  petGauges,
  shopItems,
} from '@jeu-ville/shared';
import { el, formatMoney, showToast } from './dom.js';

const GAUGES = [
  { key: 'hunger', label: '🍔 Faim' },
  { key: 'hygiene', label: '🚿 Hygiène' },
  { key: 'appearance', label: '👕 Apparence' },
  { key: 'health', label: '❤️ Santé' },
  { key: 'happiness', label: '😊 Bonheur' },
] as const;

/** Les rues allongent le trajet par rapport à la ligne droite (estimation des temps). */
const DETOUR_FACTOR = 1.25;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  return `${Math.round(seconds / 60)} min`;
}

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
  onBuyItem: (placeId: string, itemId: string) => void;
  onSetVehicle: (vehicle: VehicleKind | '') => void;
  onChargeScooter: () => void;
  onFeedPet: () => void;
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
  private shopPlace: ShopPlace | null = null;
  private readonly vehicleButton: HTMLButtonElement;
  private readonly chargeButton: HTMLButtonElement;
  private readonly petCard: HTMLElement;
  private position: TilePoint = { x: 0, y: 0 };
  private readonly busButtons: { button: HTMLButtonElement; point: () => TilePoint | null }[] = [];
  private readonly walkButtons: { button: HTMLButtonElement; point: () => TilePoint | null }[] = [];
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
    this.chargeButton = el('button', { class: 'primary', text: '🔌 Recharger la trottinette' });
    this.chargeButton.addEventListener('click', () => callbacks.onChargeScooter());
    this.homePanel.append(this.chargeButton);
    this.foodPanel = el('div', { class: 'home-panel food-panel' });
    this.foodPanel.hidden = true;
    // À pied → vélo → trottinette → à pied…
    this.vehicleButton = el('button', { class: 'vehicle-toggle', title: 'Changer de moyen de déplacement' });
    this.vehicleButton.hidden = true;
    this.vehicleButton.addEventListener('click', () => {
      const self = this.self;
      if (!self) return;
      const order: (VehicleKind | '')[] = ['', ...self.vehicles.map((v) => v.kind)];
      const next = order[(order.indexOf(self.activeVehicle) + 1) % order.length]!;
      callbacks.onSetVehicle(next);
    });
    this.petCard = el('div', { class: 'hud-card pet-card' });
    this.petCard.hidden = true;

    this.root = el('div', {}, [
      el('div', { class: 'hud-top' }, [
        el('div', { class: 'hud-card identity' }, [this.nameEl, this.metaEl, this.moneyEl]),
        gauges,
        this.petCard,
      ]),
      el('div', { class: 'hud-bottom' }, [this.homePanel, this.foodPanel, this.vehicleButton, this.goToButton, recenter]),
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
    this.renderVehicle();
    this.renderPet();
    this.chargeButton.hidden = !self.vehicles.some((v) => hasBattery(v.kind));
    // Les boutons de la boutique dépendent de ce qu'on possède.
    if (this.shopPlace) this.renderShop(this.shopPlace);
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
    if (!place && this.shopPlace) return;
    this.foodPanel.hidden = !place;
    this.foodPanel.replaceChildren();
    if (!place) return;
    for (const item of foodMenu(place.kind)) {
      const b = el('button', { class: 'primary', text: `${item.icon} ${item.label} (${formatMoney(item.costCents)})` });
      b.addEventListener('click', () => this.callbacks.onBuyFood(place.id, item.id));
      this.foodPanel.append(b);
    }
  }

  /** Boutique (cycles, animalerie) devant laquelle se trouve le perso. */
  setNearShop(place: ShopPlace | null): void {
    if (place?.id === this.shopPlace?.id) return;
    this.shopPlace = place;
    if (place) this.renderShop(place);
    else if (!this.foodPlaceId) {
      this.foodPanel.hidden = true;
      this.foodPanel.replaceChildren();
    }
  }

  private renderShop(place: ShopPlace): void {
    this.foodPanel.hidden = false;
    this.foodPanel.replaceChildren();
    for (const item of shopItems(place.kind)) {
      const owned =
        (item.type === 'vehicle' && !!this.self?.vehicles.some((v) => v.kind === item.vehicle)) || (item.type === 'pet' && !!this.self?.pet);
      const b = el('button', { class: 'primary', text: `${item.icon} ${item.label} (${formatMoney(item.costCents)})` });
      if (owned) {
        b.disabled = true;
        b.title = item.type === 'pet' ? 'Tu as déjà un animal' : 'Tu l’as déjà';
      }
      b.addEventListener('click', () => this.callbacks.onBuyItem(place.id, item.id));
      this.foodPanel.append(b);
    }
  }

  private renderVehicle(): void {
    const self = this.self;
    if (!self || self.vehicles.length === 0) {
      this.vehicleButton.hidden = true;
      return;
    }
    this.vehicleButton.hidden = false;
    const v = self.vehicles.find((x) => x.kind === self.activeVehicle);
    this.vehicleButton.textContent = v
      ? `${VEHICLES[v.kind].icon}${hasBattery(v.kind) ? ` ${Math.round(v.battery)} %` : ''}`
      : '🚶';
    this.vehicleButton.classList.toggle('low', !!v && hasBattery(v.kind) && v.battery < 20);
  }

  private renderPet(): void {
    const pet = this.self?.pet;
    this.petCard.hidden = !pet;
    if (!pet) return;
    const g = petGauges(pet, Date.now() - this.receivedAt + (this.self?.computedAt ?? Date.now()));
    const bar = (label: string, v: number) =>
      el('div', { class: 'pet-gauge' }, [
        el('span', { text: label }),
        el('div', { class: `gauge-bar${isCritical(v) ? ' critical' : ''}` }, [el('span', { style: `width:${v}%` })]),
      ]);
    const feed = el('button', { class: 'primary small', text: `${PETS.kibble.icon} ${formatMoney(PETS.kibble.costCents)}`, title: 'Donner des croquettes' });
    feed.addEventListener('click', () => this.callbacks.onFeedPet());
    this.petCard.replaceChildren(
      el('div', { class: 'pet-name', text: `${PETS.species[pet.species].icon} ${pet.name}` }),
      bar('🍖', g.hunger),
      bar('💛', g.happiness),
      feed,
    );
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
      const info = el('div', { class: 'destination' }, [
        el('span', { class: 'destination-icon', text: icon }),
        el('span', { class: 'destination-text' }, [el('strong', { text: name }), el('small', { text: kind })]),
      ]);
      // Toucher le lieu ou « Y aller » : le perso s'y rend tout seul (gratuit).
      const walk = el('button', { class: 'destination-walk', title: 'Y aller (gratuit)', text: '🚶 Y aller' });
      const goThere = () => {
        go();
        this.toggleDestinations(false);
      };
      info.addEventListener('click', goThere);
      walk.addEventListener('click', goThere);
      this.walkButtons.push({ button: walk, point });
      const bus = el('button', { class: 'destination-bus', title: `En bus, plus rapide (${formatMoney(TRAVEL.busFareCents)})`, text: `🚌 Bus ${formatMoney(TRAVEL.busFareCents)}` });
      bus.addEventListener('click', () => {
        const p = point();
        if (!p) return;
        this.callbacks.onBusTo(p);
        this.toggleDestinations(false);
      });
      this.busButtons.push({ button: bus, point });
      const r = el('div', { class: 'destination-row' }, [info, el('div', { class: 'destination-actions' }, [walk, bus])]);
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
    // Temps estimé à pied (ou à vélo / en trottinette si l'on roule).
    const vehicle = this.self?.activeVehicle ?? '';
    const mode = vehicle ? VEHICLES[vehicle].icon : '🚶';
    for (const w of this.walkButtons) {
      const p = w.point();
      if (!p) continue;
      const seconds = (Math.hypot(p.x - this.position.x, p.y - this.position.y) * DETOUR_FACTOR) / (MOVEMENT.walkTilesPerSecond * speedFactor(vehicle));
      w.button.textContent = `${mode} ${formatDuration(seconds)}`;
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
    this.renderPet();
    // Même formule que le serveur : affichage prédictif uniquement.
    const current = decayGauges(this.self.gauges, Date.now() - this.receivedAt);
    const values: Record<string, number> = { ...current, happiness: computeHappiness(current, this.self.happinessBonus) };
    for (const g of GAUGES) {
      const bar = this.bars.get(g.key)!;
      const v = values[g.key] ?? 0;
      (bar.firstElementChild as HTMLElement).style.width = `${v}%`;
      bar.classList.toggle('critical', g.key !== 'happiness' && isCritical(v));
      bar.title = `${Math.round(v)} / 100`;
    }
  }
}
