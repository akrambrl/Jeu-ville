/**
 * Agence pour l'emploi (offres des commerces bots, mon emploi) et affichage des
 * missions pendant un service (livraison, comptoir). Affiche et envoie des
 * intentions ; le serveur vérifie et paie.
 */
import {
  COUNTER_ITEMS,
  RECIPES,
  JOBS,
  MOVEMENT,
  employers,
  jobLevel,
  jobTitle,
  missionPayCents,
  type CharacterSelf,
  type DistrictMap,
  type Employer,
  type JobType,
  type MissionView,
  type TilePoint,
} from '@jeu-ville/shared';
import { KitchenGame } from './cooking.js';
import { el, formatMoney } from './dom.js';

export interface JobActions {
  apply(employerId: string): void;
  quit(): void;
  goTo(point: TilePoint): void;
}

/** Les rues allongent le trajet par rapport à la ligne droite (estimation). */
const DETOUR_FACTOR = 1.25;

export class JobCenterSheet {
  readonly root: HTMLElement;
  private readonly body = el('div', { class: 'agency-body' });
  private self: CharacterSelf | null = null;
  private position: TilePoint = { x: 0, y: 0 };
  private readonly offers: Employer[];

  constructor(
    map: DistrictMap,
    private readonly actions: JobActions,
  ) {
    this.offers = employers(map);
    const close = el('button', { class: 'sheet-close', text: 'Fermer' });
    close.addEventListener('click', () => this.close());
    const sheet = el('div', { class: 'sheet agency' }, [el('h2', { text: "💼 Agence pour l'emploi" }), this.body, close]);
    this.root = el('div', { class: 'sheet-backdrop' }, [sheet]);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.hidden = true;
  }

  open(self: CharacterSelf | null, position: TilePoint): void {
    this.self = self;
    this.position = position;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  update(self: CharacterSelf): void {
    this.self = self;
    if (!this.root.hidden) this.render();
  }

  private render(): void {
    this.body.replaceChildren();
    const job = this.self?.job;
    if (job) {
      const xp = this.self?.jobXp[job.jobType] ?? 0;
      const level = jobLevel(xp);
      const next = JOBS.levelXp[level];
      const employer = this.offers.find((o) => o.id === job.employerId);
      const go = el('button', { class: 'primary small', text: '📍 Aller au travail' });
      go.addEventListener('click', () => {
        if (employer) this.actions.goTo(employer.door);
        this.close();
      });
      const quit = this.twoTap('Démissionner', () => this.actions.quit());
      this.body.append(
        el('div', { class: 'agency-card mine' }, [
          el('div', { class: 'agency-card-icon', text: JOBS[job.jobType].icon }),
          el('div', { class: 'agency-card-text' }, [
            el('strong', { text: `${jobTitle(job.jobType, xp)} · ${job.employerName}` }),
            el('small', { text: next !== undefined ? `Expérience ${xp} / ${next} pour monter de niveau` : `Expérience ${xp} : niveau maximum` }),
            el('span', { class: 'agency-price', text: `${formatMoney(missionPayCents(job.jobType, xp, false))} par mission (+ pourboires)` }),
          ]),
          el('div', { class: 'agency-card-actions' }, [go, quit]),
        ]),
        el('p', { class: 'agency-hint', text: 'Va chez ton employeur et appuie sur « Commencer le service ».' }),
      );
    } else {
      this.body.append(el('p', { class: 'agency-hint', text: 'Choisis une offre, puis va prendre ton service chez l’employeur. Une tenue correcte est demandée.' }));
    }
    for (const type of ['courier', 'counter'] as JobType[]) {
      const list = this.offers
        .filter((o) => o.jobType === type && o.id !== job?.employerId)
        .sort((a, b) => this.distance(a) - this.distance(b));
      const xp = this.self?.jobXp[type] ?? 0;
      this.body.append(
        el('h3', { class: 'jobs-type', text: `${JOBS[type].icon} ${JOBS[type].label} · ${formatMoney(missionPayCents(type, xp, false))} / mission` }),
        el('p', { class: 'agency-hint', text: type === 'courier' ? 'Livre les commandes à domicile dans les temps (le vélo aide !).' : 'Sers les clients au comptoir : la bonne commande, le plus vite possible.' }),
      );
      for (const o of list) {
        const minutes = (this.distance(o) * DETOUR_FACTOR) / MOVEMENT.walkTilesPerSecond / 60;
        const apply = this.twoTap('Postuler', () => this.actions.apply(o.id));
        if (job) {
          apply.disabled = true;
          apply.title = 'Démissionne d’abord de ton emploi actuel';
        }
        this.body.append(
          el('div', { class: 'agency-card' }, [
            el('div', { class: 'agency-card-icon', text: JOBS[type].icon }),
            el('div', { class: 'agency-card-text' }, [el('strong', { text: o.name }), el('small', { text: `${JOBS[type].missionsPerShift} missions par service · ${Math.max(1, Math.round(minutes))} min à pied` })]),
            el('div', { class: 'agency-card-actions' }, [apply]),
          ]),
        );
      }
    }
  }

  private distance(o: Employer): number {
    return Math.hypot(o.door.x - this.position.x, o.door.y - this.position.y);
  }

  private twoTap(label: string, act: () => void): HTMLButtonElement {
    const b = el('button', { class: 'primary small', text: label });
    let armed = false;
    b.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        b.textContent = 'Confirmer ?';
        b.classList.add('armed');
        window.setTimeout(() => {
          armed = false;
          b.textContent = label;
          b.classList.remove('armed');
        }, 4000);
        return;
      }
      act();
    });
    return b;
  }
}

export interface MissionActions {
  goTo(point: TilePoint): void;
  serve(items: string[]): void;
  cook(dish: string, scores: number[]): void;
  stop(): void;
  /** Cible de livraison à montrer sur la carte (null : rien). */
  showTarget(point: TilePoint | null): void;
}

/** Carte de mission pendant un service. */
export class MissionPanel {
  readonly root = el('div', { class: 'hud-card mission' });
  /** Écran de cuisine (son propre commerce de bouche). */
  readonly kitchen = new KitchenGame();
  /** Mission pour laquelle la cuisine est ouverte (index). */
  private cooking = 0;
  private deadline = 0;
  private readonly timer: number;
  private tray: string[] = [];
  private timeEl: HTMLElement | null = null;

  constructor(private readonly actions: MissionActions) {
    this.root.hidden = true;
    this.timer = window.setInterval(() => this.tickClock(), 250);
  }

  show(m: MissionView): void {
    // Le client est parti (ou le service s'arrête) pendant qu'on cuisinait.
    if (this.kitchen.isOpen && (m.kind !== 'cook' || m.index !== this.cooking)) this.kitchen.close();
    if (m.kind === 'done') {
      this.root.hidden = true;
      this.actions.showTarget(null);
      return;
    }
    this.root.hidden = false;
    this.deadline = Date.now() + m.remainingMs;
    this.timeEl = el('span', { class: 'mission-time' });
    const stop = el('button', { class: 'small mission-stop', text: 'Arrêter' });
    stop.addEventListener('click', () => this.actions.stop());
    const head = el('div', { class: 'mission-head' }, [
      el('strong', { text: `${m.kind === 'courier' ? '🛵 Livraison' : m.kind === 'cook' ? '👩‍🍳 Client' : '🧾 Client'} ${m.index}/${m.total}` }),
      this.timeEl,
      el('span', { class: 'mission-earned', text: `+${formatMoney(m.earnedCents)}` }),
      stop,
    ]);
    if (m.kind === 'courier') {
      this.actions.showTarget(m.target);
      const go = el('button', { class: 'primary small', text: '📍 Y aller' });
      go.addEventListener('click', () => this.actions.goTo(m.target));
      this.root.replaceChildren(head, el('div', { class: 'mission-body' }, [el('span', { text: `📦 ${m.address}` }), go]));
    } else if (m.kind === 'cook') {
      this.actions.showTarget(null);
      const recipe = Object.values(RECIPES)
        .flat()
        .find((r) => r.id === m.dish);
      const cook = el('button', { class: 'primary', text: '👩‍🍳 Cuisiner' });
      const start = () => {
        if (!recipe) return;
        this.cooking = m.index;
        this.kitchen.play(recipe, (scores) => this.actions.cook(m.dish, scores));
      };
      cook.addEventListener('click', start);
      this.root.replaceChildren(
        head,
        el('div', { class: 'mission-order' }, [
          el('span', { text: '🧑 Je voudrais :' }),
          el('span', { class: 'order-icons', text: `${recipe?.icon ?? '🍽️'} ${recipe?.label ?? m.dish}` }),
        ]),
        cook,
      );
    } else {
      this.actions.showTarget(null);
      this.tray = [];
      const icon = (id: string) => COUNTER_ITEMS.find((i) => i.id === id)?.icon ?? '❔';
      const trayEl = el('div', { class: 'mission-tray' });
      const renderTray = () => {
        trayEl.replaceChildren(
          ...(this.tray.length === 0
            ? [el('small', { text: 'Ton plateau est vide' })]
            : this.tray.map((id, k) => {
                const b = el('button', { class: 'tray-item', text: icon(id), title: 'Retirer' });
                b.addEventListener('click', () => {
                  this.tray.splice(k, 1);
                  renderTray();
                });
                return b;
              })),
        );
      };
      const items = el(
        'div',
        { class: 'mission-items' },
        COUNTER_ITEMS.map((it) => {
          const b = el('button', { class: 'counter-item', text: it.icon, title: it.label });
          b.addEventListener('click', () => {
            this.tray.push(it.id);
            renderTray();
          });
          return b;
        }),
      );
      const serve = el('button', { class: 'primary', text: '✅ Servir' });
      serve.addEventListener('click', () => this.actions.serve(this.tray));
      renderTray();
      this.root.replaceChildren(
        head,
        el('div', { class: 'mission-order' }, [el('span', { text: '🧑 Je voudrais :' }), el('span', { class: 'order-icons', text: m.order.map(icon).join(' ') })]),
        items,
        trayEl,
        serve,
      );
    }
    this.tickClock();
  }

  private tickClock(): void {
    if (this.root.hidden || !this.timeEl) return;
    const s = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    this.timeEl.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timeEl.classList.toggle('late', s <= 10);
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }
}
