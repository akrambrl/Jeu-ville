/**
 * Mission du quotidien en cours : ce qu'il faut faire, le temps restant,
 * « y aller » (ou la zone de recherche), et « laisser tomber ».
 */
import { ERRAND_TYPES, type ErrandType, type ErrandView, type TilePoint } from '@jeu-ville/shared';
import { el, formatMoney } from './dom.js';

export interface ErrandPanelActions {
  goTo(point: TilePoint): void;
  abandon(): void;
}

export class ErrandPanel {
  readonly root = el('div', { class: 'hud-card errand' });
  private deadline = 0;
  private timeEl: HTMLElement | null = null;
  private readonly timer: number;

  constructor(private readonly actions: ErrandPanelActions) {
    this.root.hidden = true;
    this.timer = window.setInterval(() => this.tickClock(), 1000);
  }

  show(view: ErrandView): void {
    if (view.kind !== 'active') {
      this.root.hidden = true;
      return;
    }
    const cfg = ERRAND_TYPES[view.type];
    this.root.hidden = false;
    this.deadline = Date.now() + view.remainingMs;
    this.timeEl = el('span', { class: 'mission-time' });
    const goal = view.target ?? (view.area ? { x: Math.round(view.area.x), y: Math.round(view.area.y) } : null);
    const go = el('button', { class: 'primary small', text: view.target ? '📍 Y aller' : '🔎 Aller à la zone' });
    go.addEventListener('click', () => goal && this.actions.goTo(goal));
    go.hidden = !goal;
    const stop = el('button', { class: 'small mission-stop', text: 'Laisser tomber' });
    let armed = false;
    stop.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        stop.textContent = 'Sûr ?';
        window.setTimeout(() => {
          armed = false;
          stop.textContent = 'Laisser tomber';
        }, 4000);
        return;
      }
      this.actions.abandon();
    });
    this.root.replaceChildren(
      el('div', { class: 'mission-head' }, [el('strong', { text: `${cfg.icon} ${cfg.title} ${view.step}/${view.steps}` }), this.timeEl]),
      el('div', { class: 'mission-body' }, [el('span', { text: view.text }), go]),
      el('div', { class: 'errand-foot' }, [el('small', { text: `Récompense : ${rewardText(view.type)}` }), stop]),
    );
    this.tickClock();
  }

  private tickClock(): void {
    if (this.root.hidden || !this.timeEl) return;
    const s = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    this.timeEl.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timeEl.classList.toggle('late', s <= 30);
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }
}

/** « 20 € · 😊 +10 bonheur » */
export function rewardText(type: ErrandType): string {
  const cfg = ERRAND_TYPES[type];
  return [cfg.rewardCents > 0 ? formatMoney(cfg.rewardCents) : '', cfg.kindness > 0 ? `😊 +${cfg.kindness} bonheur` : ''].filter(Boolean).join(' · ');
}
