/**
 * Cuisine façon « Cooking Mama » (son propre commerce de bouche) : écran plein
 * avec une étape par geste au doigt (couper, remuer, retourner au bon moment,
 * verser, monter le plat, tapoter). Chaque étape est notée de 0 à 1 ; à la fin
 * on envoie les notes au serveur, qui vérifie, attribue les étoiles et paie.
 */
import {
  COOKING,
  assembleScore,
  cookStars,
  countScore,
  pourScore,
  timingScore,
  type CookStep,
  type Recipe,
} from '@jeu-ville/shared';
import { el } from './dom.js';

/** Temps pendant lequel on montre la note d'une étape, puis celle du plat (ms). */
const STEP_FEEDBACK_MS = 800;
const DISH_FEEDBACK_MS = 1400;

/** Une étape en cours : renvoie de quoi l'arrêter et lire sa note actuelle. */
interface StepRun {
  /** Note si le temps est écoulé maintenant. */
  score(): number;
  stop(): void;
}

export class KitchenGame {
  readonly root: HTMLElement;
  private readonly title = el('strong', { class: 'kitchen-title' });
  private readonly dots = el('div', { class: 'kitchen-dots' });
  private readonly hint = el('div', { class: 'kitchen-hint' });
  private readonly bar = el('div', { class: 'kitchen-bar-fill' });
  private readonly stage = el('div', { class: 'kitchen-stage' });
  private readonly feedback = el('div', { class: 'kitchen-feedback' });
  private run: StepRun | null = null;
  private frame = 0;
  private timer = 0;
  /** Change à chaque partie : une partie abandonnée ne termine pas la suivante. */
  private game = 0;

  constructor() {
    const quit = el('button', { class: 'small', text: 'Abandonner' });
    quit.addEventListener('click', () => this.close());
    this.root = el('div', { class: 'kitchen' }, [
      el('div', { class: 'kitchen-card' }, [
        el('div', { class: 'kitchen-head' }, [this.title, quit]),
        this.dots,
        this.hint,
        el('div', { class: 'kitchen-bar' }, [this.bar]),
        this.stage,
        this.feedback,
      ]),
    ]);
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Lance la préparation d'un plat ; `done` reçoit les notes des étapes. */
  play(recipe: Recipe, done: (scores: number[]) => void): void {
    this.close();
    const game = ++this.game;
    this.root.hidden = false;
    this.title.textContent = `${recipe.icon} ${recipe.label}`;
    const scores: number[] = [];
    const next = () => {
      if (game !== this.game) return;
      const step = recipe.steps[scores.length];
      if (!step) return this.finish(recipe, scores, game, done);
      this.renderDots(recipe, scores.length);
      this.startStep(step, (score) => {
        if (game !== this.game) return;
        scores.push(score);
        this.showFeedback(score >= 0.85 ? '✨ Parfait !' : score >= 0.55 ? '👍 Bien !' : '😬 Bof…', score >= 0.55);
        window.setTimeout(next, STEP_FEEDBACK_MS);
      });
    };
    next();
  }

  close(): void {
    this.game++;
    this.stopStep();
    this.root.hidden = true;
  }

  private finish(recipe: Recipe, scores: number[], game: number, done: (scores: number[]) => void): void {
    this.renderDots(recipe, scores.length);
    const stars = cookStars(scores);
    this.hint.textContent = 'Le plat est prêt !';
    this.stage.replaceChildren(el('div', { class: 'kitchen-dish', text: recipe.icon }));
    this.showFeedback('⭐'.repeat(stars) + '☆'.repeat(3 - stars), stars >= 2);
    window.setTimeout(() => {
      if (game !== this.game) return;
      this.close();
      done(scores);
    }, DISH_FEEDBACK_MS);
  }

  private renderDots(recipe: Recipe, current: number): void {
    this.dots.replaceChildren(
      ...recipe.steps.map((s, k) => el('span', { class: `kitchen-dot${k < current ? ' done' : k === current ? ' now' : ''}`, text: s.icon })),
    );
  }

  private showFeedback(text: string, good: boolean): void {
    this.feedback.textContent = text;
    this.feedback.className = `kitchen-feedback show ${good ? 'good' : 'bad'}`;
    window.setTimeout(() => (this.feedback.className = 'kitchen-feedback'), STEP_FEEDBACK_MS);
  }

  private stopStep(): void {
    this.run?.stop();
    this.run = null;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.timer);
    this.stage.replaceChildren();
  }

  /** Démarre une étape ; `end` est appelé une seule fois avec sa note. */
  private startStep(step: CookStep, end: (score: number) => void): void {
    this.stopStep();
    this.hint.textContent = step.label;
    const limit = COOKING.stepTimeMs[step.gesture];
    const started = performance.now();
    let ended = false;
    const finish = (score: number) => {
      if (ended) return;
      ended = true;
      this.stopStep();
      end(score);
    };
    this.run = GESTURES[step.gesture](this.stage, step, finish);
    const tick = () => {
      const left = Math.max(0, 1 - (performance.now() - started) / limit);
      this.bar.style.width = `${left * 100}%`;
      this.bar.classList.toggle('late', left < 0.25);
      if (left <= 0) return finish(this.run?.score() ?? 0);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }
}

type Gesture = (stage: HTMLElement, step: CookStep, finish: (score: number) => void) => StepRun;

/** Écoute les pointeurs sur la scène (un seul doigt) ; renvoie de quoi arrêter. */
function pointer(
  stage: HTMLElement,
  handlers: { down?: (e: PointerEvent) => void; move?: (e: PointerEvent) => void; up?: (e: PointerEvent) => void },
): () => void {
  const down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché : sans importance.
    }
    handlers.down?.(e);
  };
  const move = (e: PointerEvent) => handlers.move?.(e);
  const up = (e: PointerEvent) => handlers.up?.(e);
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  return () => {
    stage.removeEventListener('pointerdown', down);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerup', up);
    stage.removeEventListener('pointercancel', up);
  };
}

/** Rejoue une petite animation CSS sur un élément. */
function bump(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const counter = (done: number, needed: number, unit: string) => `${Math.min(done, needed)} / ${needed} ${unit}`;

const GESTURES: Record<CookStep['gesture'], Gesture> = {
  /** Couper : un trait de doigt à travers l'ingrédient = une coupe. */
  chop(stage, step, finish) {
    const needed = step.count ?? 1;
    let cuts = 0;
    let start: { x: number; y: number } | null = null;
    const food = el('div', { class: 'kitchen-food', text: step.icon });
    const info = el('div', { class: 'kitchen-count', text: counter(0, needed, 'coupes') });
    stage.append(food, info, el('div', { class: 'kitchen-tip', text: '👆 Glisse le doigt à travers' }));
    const off = pointer(stage, {
      down: (e) => (start = { x: e.clientX, y: e.clientY }),
      move: (e) => {
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) < COOKING.chopMinPx) return;
        start = null;
        cuts++;
        info.textContent = counter(cuts, needed, 'coupes');
        const r = stage.getBoundingClientRect();
        const slash = el('div', { class: 'kitchen-slash' });
        slash.style.left = `${e.clientX - r.left}px`;
        slash.style.top = `${e.clientY - r.top}px`;
        stage.append(slash);
        window.setTimeout(() => slash.remove(), 400);
        bump(food, 'hit');
        if (cuts >= needed) finish(1);
      },
      up: () => (start = null),
    });
    return { score: () => countScore(cuts, needed), stop: off };
  },

  /** Remuer : tourner autour du centre de la marmite. */
  stir(stage, step, finish) {
    const needed = step.count ?? 1;
    let total = 0;
    let last: number | null = null;
    const pot = el('div', { class: 'kitchen-pot' }, [el('span', { text: step.icon }), el('span', { class: 'kitchen-spoon', text: '🥄' })]);
    const info = el('div', { class: 'kitchen-count', text: counter(0, needed, 'tours') });
    stage.append(pot, info, el('div', { class: 'kitchen-tip', text: '🔄 Tourne en rond avec le doigt' }));
    const angle = (e: PointerEvent) => {
      const r = pot.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    const off = pointer(stage, {
      down: (e) => (last = angle(e)),
      move: (e) => {
        if (last === null) return;
        const a = angle(e);
        let d = a - last;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        last = a;
        total += Math.abs(d);
        const turns = total / (2 * Math.PI);
        pot.style.setProperty('--spin', `${total}rad`);
        info.textContent = counter(Math.floor(turns), needed, 'tours');
        if (turns >= needed) finish(1);
      },
      up: () => (last = null),
    });
    return { score: () => countScore(total / (2 * Math.PI), needed), stop: off };
  },

  /** Tapoter vite (pétrir, saler). */
  mash(stage, step, finish) {
    const needed = step.count ?? 1;
    let taps = 0;
    const food = el('div', { class: 'kitchen-food', text: step.icon });
    const info = el('div', { class: 'kitchen-count', text: counter(0, needed, '') });
    stage.append(food, info, el('div', { class: 'kitchen-tip', text: '👆 Tapote vite !' }));
    const off = pointer(stage, {
      down: () => {
        taps++;
        info.textContent = counter(taps, needed, '');
        bump(food, 'hit');
        if (taps >= needed) finish(1);
      },
    });
    return { score: () => countScore(taps, needed), stop: off };
  },

  /** Au bon moment : le curseur va et vient, toucher quand il est dans le vert. */
  timing(stage, step, finish) {
    const center = 0.3 + Math.random() * 0.4;
    const zone = el('div', { class: 'kitchen-zone' });
    zone.style.left = `${(center - COOKING.timingZone) * 100}%`;
    zone.style.width = `${COOKING.timingZone * 200}%`;
    const cursor = el('div', { class: 'kitchen-cursor' });
    const gauge = el('div', { class: 'kitchen-gauge' }, [zone, cursor]);
    stage.append(el('div', { class: 'kitchen-food sizzle', text: step.icon }), gauge, el('div', { class: 'kitchen-tip', text: '👆 Touche quand le curseur est dans le vert' }));
    const t0 = performance.now();
    let pos = 0;
    let frame = 0;
    const move = () => {
      // Aller-retour (onde triangle) entre 0 et 1.
      const phase = (((performance.now() - t0) / 1000) * COOKING.timingSpeed) % 2;
      pos = phase < 1 ? phase : 2 - phase;
      cursor.style.left = `${pos * 100}%`;
      frame = requestAnimationFrame(move);
    };
    move();
    const off = pointer(stage, { down: () => finish(timingScore(pos, center)) });
    return {
      score: () => 0,
      stop: () => {
        cancelAnimationFrame(frame);
        off();
      },
    };
  },

  /** Verser : maintenir pour remplir, relâcher au trait. */
  pour(stage, step, finish) {
    let level = 0;
    let holding = false;
    let frame = 0;
    let last = 0;
    const fill = el('div', { class: 'kitchen-fill' });
    const line = el('div', { class: 'kitchen-line' });
    line.style.bottom = `${COOKING.pourTarget * 100}%`;
    const glass = el('div', { class: 'kitchen-glass' }, [fill, line]);
    stage.append(el('div', { class: 'kitchen-source', text: step.icon }), glass, el('div', { class: 'kitchen-tip', text: '✋ Maintiens pour verser, lâche au trait' }));
    const grow = (now: number) => {
      if (!holding) return;
      level = Math.min(1, level + (now - last) / COOKING.pourFillMs);
      last = now;
      fill.style.height = `${level * 100}%`;
      if (level >= 1) return finish(pourScore(level));
      frame = requestAnimationFrame(grow);
    };
    const off = pointer(stage, {
      down: () => {
        holding = true;
        last = performance.now();
        glass.classList.add('pouring');
        frame = requestAnimationFrame(grow);
      },
      up: () => {
        if (!holding) return;
        holding = false;
        finish(pourScore(level));
      },
    });
    return {
      score: () => (level > 0 ? pourScore(level) : 0),
      stop: () => {
        cancelAnimationFrame(frame);
        off();
      },
    };
  },

  /** Monter le plat : toucher les ingrédients dans l'ordre de la recette. */
  assemble(stage, step, finish) {
    const layers = step.layers ?? [];
    let placed = 0;
    let mistakes = 0;
    const plate = el('div', { class: 'kitchen-plate' });
    const model = el('div', { class: 'kitchen-model' }, [el('small', { text: 'Ordre :' }), ...layers.map((l) => el('span', { text: l }))]);
    const choices = [...new Set(layers)].sort(() => Math.random() - 0.5);
    const buttons = el(
      'div',
      { class: 'kitchen-choices' },
      choices.map((icon) => {
        const b = el('button', { class: 'kitchen-choice', text: icon });
        b.addEventListener('click', () => {
          if (layers[placed] === icon) {
            placed++;
            plate.append(el('span', { class: 'kitchen-layer', text: icon }));
            model.children[placed]?.classList.add('done');
            if (placed >= layers.length) finish(assembleScore(placed, layers.length, mistakes));
          } else {
            mistakes++;
            bump(b, 'wrong');
          }
        });
        return b;
      }),
    );
    stage.append(model, plate, buttons);
    return { score: () => assembleScore(placed, layers.length, mistakes), stop: () => undefined };
  },
};
