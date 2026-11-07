/**
 * Tutoriel illustré en 4 étapes : montré automatiquement avant la toute
 * première partie, et revu à volonté depuis les règles.
 */
import { CARD_GAME } from '@jeu-ville/shared';
import { categoryTile, coin } from './tiles.js';
import { el } from './dom.js';
import { play } from './fx.js';

const SEEN_KEY = 'bac-bataille.tutorial-seen';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* navigation privée */
  }
}

interface Step {
  title: string;
  text: string;
  visual: () => HTMLElement;
}

/** Petite pile de pièces avec son nombre. */
const purse = (n: number) => el('div', { class: 'tuto-purse' }, [coin(), el('span', { text: String(n) })]);

const STEPS: Step[] = [
  {
    title: 'Ruine les autres !',
    text: `Chacun reçoit ${CARD_GAME.coins.start} pièces d’or. Le dernier qui a encore des pièces gagne la partie.`,
    visual: () => el('div', { class: 'tuto-visual' }, [purse(CARD_GAME.coins.start), el('span', { class: 'tuto-arrow', text: '➜' }), el('span', { class: 'tuto-big', text: '🏆' })]),
  },
  {
    title: 'Chacun mise',
    text: 'À chaque manche, tout le monde pose une pièce au milieu (puis 2, puis 3… la mise monte au fil de la partie). Ça fait un tas !',
    visual: () => el('div', { class: 'tuto-visual' }, [purse(9), el('span', { class: 'tuto-arrow', text: '➜' }), el('div', { class: 'tuto-pot' }, [coin(), coin(), coin()]), el('span', { class: 'tuto-arrow back', text: '⬅' }), purse(9)]),
  },
  {
    title: 'Ça tourne… MATCH !',
    text: 'Les catégories défilent devant chaque joueur et s’arrêtent sur la même. Une lettre est tirée en même temps.',
    visual: () => el('div', { class: 'tuto-visual' }, [categoryTile('sport', 'landed'), el('div', { class: 'letter-badge tuto-letter' }, [el('span', { class: 'letter-label', text: 'Lettre' }), el('span', { class: 'letter', text: 'T' })]), categoryTile('sport', 'landed')]),
  },
  {
    title: 'Le plus rapide rafle tout',
    text: 'Écris vite un mot qui commence par la lettre, dans la catégorie : tu gagnes tout le tas ! Si personne ne trouve, les pièces restent au milieu (cagnotte).',
    visual: () => el('div', { class: 'tuto-visual column' }, [el('div', { class: 'tuto-input' }, [el('span', { text: 'T' }), el('span', { class: 'typed', text: 'ennis' }), el('span', { class: 'go', text: 'GO !' })]), el('div', { class: 'tuto-big', text: '✅ +2 🪙' })]),
  },
];

/** Affiche le tutoriel ; `done` est appelé quand on le ferme (passé ou terminé). */
export function showTutorial(root: HTMLElement, done: () => void = () => {}): void {
  let k = 0;
  const visual = el('div', { class: 'tuto-stage' });
  const title = el('h2', { class: 'title' });
  const text = el('p', { class: 'tuto-text' });
  const dots = el('div', { class: 'tuto-dots' }, STEPS.map(() => el('span')));
  const skip = el('button', { class: 'link', text: 'Passer' });
  const next = el('button', { class: 'primary' });
  const overlay = el('div', { class: 'overlay' }, [el('div', { class: 'panel tuto' }, [visual, title, text, dots, el('div', { class: 'actions' }, [skip, next])])]);
  const close = () => {
    markSeen();
    overlay.remove();
    done();
  };
  const show = () => {
    const step = STEPS[k]!;
    visual.replaceChildren(step.visual());
    title.textContent = `${k + 1}. ${step.title}`;
    text.textContent = step.text;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === k));
    next.textContent = k === STEPS.length - 1 ? "C'est parti !" : 'Suivant';
    skip.hidden = k === STEPS.length - 1;
  };
  next.addEventListener('click', () => {
    play('tap');
    if (k === STEPS.length - 1) return close();
    k += 1;
    show();
  });
  skip.addEventListener('click', close);
  root.append(overlay);
  show();
}
