/**
 * Agence immobilière : annonces (louer, acheter, locaux commerciaux) et « Mes biens »
 * (emménager, rendre / revendre, ouvrir un commerce). Affiche et envoie des
 * intentions ; le serveur décide.
 */
import {
  BUSINESS_FOOD,
  BUSINESS_TYPES,
  MOVEMENT,
  REAL_ESTATE,
  businessPayoutCents,
  reputationStars,
  rentPerPeriodCents,
  salePriceCents,
  monthlyRentCents,
  type BusinessType,
  type CharacterSelf,
  type DistrictMap,
  type PropertySpot,
  type TilePoint,
} from '@jeu-ville/shared';
import { el, formatMoney } from './dom.js';

export interface AgencyActions {
  listings(): Promise<string[]>;
  buy(spotId: string): void;
  rent(spotId: string): void;
  moveIn(spotId: string): void;
  release(spotId: string): void;
  openBusiness(spotId: string, type: BusinessType, name: string): void;
  /** Aller voir le bien à pied (on ferme l'agence). */
  visit(point: TilePoint): void;
}

type Tab = 'rent' | 'buy' | 'local' | 'mine';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rent', label: '🏠 Louer' },
  { id: 'buy', label: '🔑 Acheter' },
  { id: 'local', label: '🏪 Locaux' },
  { id: 'mine', label: '⭐ À moi' },
];
/** Annonces affichées à la fois (les plus proches d'abord). */
const PAGE = 25;
/** Les rues allongent le trajet par rapport à la ligne droite (estimation). */
const DETOUR_FACTOR = 1.25;

export class AgencySheet {
  readonly root: HTMLElement;
  private readonly body = el('div', { class: 'agency-body' });
  private readonly tabs = new Map<Tab, HTMLButtonElement>();
  private tab: Tab = 'rent';
  private taken = new Set<string>();
  private shown = PAGE;
  private self: CharacterSelf | null = null;
  private position: TilePoint = { x: 0, y: 0 };

  constructor(
    private readonly map: DistrictMap,
    private readonly actions: AgencyActions,
  ) {
    const tabBar = el('div', { class: 'agency-tabs' });
    for (const t of TABS) {
      const b = el('button', { class: 'agency-tab', text: t.label });
      b.addEventListener('click', () => this.show(t.id));
      this.tabs.set(t.id, b);
      tabBar.append(b);
    }
    const close = el('button', { class: 'sheet-close', text: 'Fermer' });
    close.addEventListener('click', () => this.close());
    const sheet = el('div', { class: 'sheet agency' }, [el('h2', { text: '🔑 Agence immobilière' }), tabBar, this.body, close]);
    this.root = el('div', { class: 'sheet-backdrop' }, [sheet]);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.hidden = true;
  }

  /** Ouvre l'agence (sur l'onglet `tab`, sinon le dernier consulté). */
  async open(self: CharacterSelf | null, position: TilePoint, tab?: Tab): Promise<void> {
    if (tab) this.tab = tab;
    this.self = self;
    this.position = position;
    this.root.hidden = false;
    this.body.replaceChildren(el('p', { class: 'agency-empty', text: 'Chargement des annonces…' }));
    this.taken = new Set(await this.actions.listings());
    this.show(this.tab);
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Nouvelle vue privée (après un achat…) : on rafraîchit si l'agence est ouverte. */
  update(self: CharacterSelf): void {
    this.self = self;
    if (!this.root.hidden) {
      void this.actions.listings().then((t) => {
        this.taken = new Set(t);
        this.show(this.tab, true);
      });
    }
  }

  private show(tab: Tab, keepPage = false): void {
    this.tab = tab;
    if (!keepPage) this.shown = PAGE;
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === tab);
    this.body.replaceChildren();
    if (tab === 'mine') return this.renderMine();
    const mine = new Set(this.self?.properties.map((p) => p.spotId) ?? []);
    const offers = this.map.properties
      .filter((p) => (tab === 'local' ? p.kind === 'local' : p.kind !== 'local'))
      .filter((p) => !this.taken.has(p.id) && !mine.has(p.id))
      .sort((a, b) => this.distance(a) - this.distance(b));
    this.body.append(el('p', { class: 'agency-hint', text: this.hint(tab, offers.length) }));
    for (const spot of offers.slice(0, this.shown)) this.body.append(this.offerCard(spot, tab));
    if (offers.length > this.shown) {
      const more = el('button', { class: 'agency-more', text: `Voir plus (${offers.length - this.shown})` });
      more.addEventListener('click', () => {
        this.shown += PAGE;
        this.show(tab, true);
      });
      this.body.append(more);
    }
  }

  private hint(tab: Tab, count: number): string {
    if (tab === 'rent') return `${count} logements à louer, les plus proches d'abord. Loyer prélevé chaque jour.`;
    if (tab === 'buy') return `${count} logements à vendre. Une fois achetés, plus de loyer.`;
    return `${count} locaux libres : loue ou achète, puis ouvre ton commerce.`;
  }

  private distance(spot: PropertySpot): number {
    return Math.hypot(spot.door.x - this.position.x, spot.door.y - this.position.y);
  }

  private minutes(spot: PropertySpot): string {
    const s = (this.distance(spot) * DETOUR_FACTOR) / MOVEMENT.walkTilesPerSecond;
    return s < 60 ? `${Math.max(5, Math.round(s / 5) * 5)} s à pied` : `${Math.round(s / 60)} min à pied`;
  }

  private offerCard(spot: PropertySpot, tab: Tab): HTMLElement {
    const icon = spot.kind === 'house' ? '🏡' : spot.kind === 'local' ? '🏪' : '🏢';
    const size = spot.kind === 'local' ? 'Rez-de-chaussée sur rue' : `${spot.rooms} pièces`;
    const price =
      tab === 'buy'
        ? `${formatMoney(salePriceCents(spot))}`
        : tab === 'rent'
          ? `${formatMoney(monthlyRentCents(spot))} / mois`
          : `${formatMoney(monthlyRentCents(spot))} / mois ou ${formatMoney(salePriceCents(spot))}`;
    const visit = el('button', { class: 'agency-visit', text: '📍 Visiter' });
    visit.addEventListener('click', () => {
      this.actions.visit(spot.door);
      this.close();
    });
    const buttons: HTMLElement[] = [visit];
    if (tab !== 'buy') buttons.push(this.confirmButton(`Louer`, () => this.actions.rent(spot.id), rentPerPeriodCents(spot)));
    if (tab !== 'rent') buttons.push(this.confirmButton(`Acheter`, () => this.actions.buy(spot.id), salePriceCents(spot)));
    return el('div', { class: 'agency-card' }, [
      el('div', { class: 'agency-card-icon', text: icon }),
      el('div', { class: 'agency-card-text' }, [
        el('strong', { text: spot.name }),
        el('small', { text: `${size} · ${this.minutes(spot)}` }),
        el('span', { class: 'agency-price', text: price }),
      ]),
      el('div', { class: 'agency-card-actions' }, buttons),
    ]);
  }

  /** Bouton à deux appuis : « Acheter » puis « Confirmer ? ». */
  private confirmButton(label: string, act: () => void, costCents: number): HTMLButtonElement {
    const b = el('button', { class: 'primary small', text: label });
    const tooPoor = (this.self?.moneyCents ?? 0) < costCents;
    if (tooPoor) {
      b.disabled = true;
      b.title = "Pas assez d'argent";
    }
    let armed = false;
    b.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        b.textContent = costCents > 0 ? `Confirmer (${formatMoney(costCents)}) ?` : 'Confirmer ?';
        b.classList.add('armed');
        window.setTimeout(() => {
          armed = false;
          b.textContent = label;
          b.classList.remove('armed');
        }, 4000);
        return;
      }
      act();
      b.disabled = true;
      b.textContent = '…';
    });
    return b;
  }

  private renderMine(): void {
    const owned = this.self?.properties ?? [];
    if (owned.length === 0) {
      this.body.append(el('p', { class: 'agency-empty', text: 'Tu n’as encore rien acheté ni loué. Regarde les annonces !' }));
      return;
    }
    for (const p of owned) {
      const spot = this.map.properties.find((s) => s.id === p.spotId);
      if (!spot) continue;
      const isHome = this.self?.home?.dwellingId.endsWith(spot.id) ?? false;
      const status = p.relation === 'owner' ? 'Propriétaire' : `Locataire · ${formatMoney(monthlyRentCents(spot))} / mois`;
      const actions: HTMLElement[] = [];
      const visit = el('button', { class: 'agency-visit', text: '📍 Y aller' });
      visit.addEventListener('click', () => {
        this.actions.visit(spot.door);
        this.close();
      });
      actions.push(visit);
      if (spot.kind !== 'local' && !isHome) {
        const move = el('button', { class: 'primary small', text: '🏠 Emménager' });
        move.addEventListener('click', () => this.actions.moveIn(spot.id));
        actions.push(move);
      }
      const refund = Math.round(salePriceCents(spot) * REAL_ESTATE.resaleShare);
      actions.push(
        this.confirmButton(p.relation === 'owner' ? `Revendre ${formatMoney(refund)}` : 'Rendre', () => this.actions.release(spot.id), 0),
      );
      const card = el('div', { class: 'agency-card' }, [
        el('div', { class: 'agency-card-icon', text: spot.kind === 'local' ? '🏪' : isHome ? '🏠' : '🏢' }),
        el('div', { class: 'agency-card-text' }, [
          el('strong', { text: spot.name }),
          el('small', { text: `${status}${isHome ? ' · tu habites ici' : ''}` }),
          p.business
            ? el('span', {
                class: 'agency-price',
                text: `${BUSINESS_TYPES[p.business.type].icon} ${p.business.name} · ≈ ${formatMoney(businessPayoutCents(p.business.type, spot, p.business.reputation) * 24)} / jour${
                  p.business.type in BUSINESS_FOOD
                    ? ` · réputation ${'★'.repeat(reputationStars(p.business.reputation))}${'☆'.repeat(5 - reputationStars(p.business.reputation))} · 👩‍🍳 cuisine toi-même pour gagner plus et faire monter ta réputation`
                    : ''
                }`,
              })
            : el('span'),
        ]),
        el('div', { class: 'agency-card-actions' }, actions),
      ]);
      this.body.append(card);
      if (spot.kind === 'local' && !p.business) this.body.append(this.businessForm(spot));
    }
  }

  /** Ouvrir un commerce dans un local : type, nom, travaux. */
  private businessForm(spot: PropertySpot): HTMLElement {
    const types = Object.keys(BUSINESS_TYPES) as BusinessType[];
    let chosen: BusinessType = types[0]!;
    const name = el('input', { class: 'agency-input', placeholder: 'Nom de ton commerce', maxlength: '18' });
    const choices = el('div', { class: 'agency-types' });
    const submit = el('button', { class: 'primary' });
    const refresh = () => {
      for (const b of choices.children) b.classList.toggle('active', (b as HTMLElement).dataset.type === chosen);
      const t = BUSINESS_TYPES[chosen];
      submit.textContent = `Ouvrir (travaux ${formatMoney(t.setupCents)})`;
      submit.disabled = (this.self?.moneyCents ?? 0) < t.setupCents;
    };
    for (const id of types) {
      const t = BUSINESS_TYPES[id];
      const b = el('button', { class: 'agency-type', 'data-type': id }, [
        el('span', { text: `${t.icon} ${t.label}` }),
        el('small', { text: `≈ ${formatMoney(businessPayoutCents(id, spot) * 24)} / jour` }),
      ]);
      b.addEventListener('click', () => {
        chosen = id;
        refresh();
      });
      choices.append(b);
    }
    submit.addEventListener('click', () => this.actions.openBusiness(spot.id, chosen, name.value));
    refresh();
    return el('div', { class: 'agency-business' }, [el('strong', { text: '🛠️ Ouvrir un commerce ici' }), choices, name, submit]);
  }
}
