/**
 * Tutoriel illustré en 4 étapes : montré automatiquement avant la toute
 * première partie, et revu à volonté depuis les règles.
 */
import { CARD_GAME, type Card } from '@jeu-ville/shared';
import { cardBack, cardFace } from './cardView.js';
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

const MINE: Card = { id: -1, color: 'red', categories: ['sport', 'firstName'] };
const THEIRS: Card = { id: -2, color: 'blue', categories: ['animal', 'sport'] };

interface Step {
  title: string;
  text: string;
  visual: () => HTMLElement;
}

const STEPS: Step[] = [
  {
    title: 'Vide ton paquet !',
    text: `Chacun reçoit ${CARD_GAME.cardsPerPlayer} cartes face cachée. Le premier qui n'a plus aucune carte gagne la partie.`,
    visual: () => el('div', { class: 'tuto-visual' }, [el('div', { class: 'tuto-deck' }, [cardBack(), el('span', { class: 'count', text: String(CARD_GAME.cardsPerPlayer) })]), el('span', { class: 'tuto-arrow', text: '➜' }), el('span', { class: 'tuto-big', text: '0 🏆' })]),
  },
  {
    title: 'Une lettre, et on pose',
    text: "Une lettre est tirée au hasard. Puis tout le monde retourne en même temps la carte du dessus de son paquet. Chaque carte a 2 catégories, chacune avec sa couleur.",
    visual: () => el('div', { class: 'tuto-visual' }, [el('div', { class: 'letter-badge tuto-letter' }, [el('span', { class: 'letter-label', text: 'Lettre' }), el('span', { class: 'letter', text: 'T' })]), cardFace(MINE), cardFace(THEIRS)]),
  },
  {
    title: 'Même catégorie = DUEL !',
    text: 'Si ta carte a une catégorie en commun avec celle d’un autre joueur (même couleur), c’est le duel ! Ici : ⚽ Sport.',
    visual: () => el('div', { class: 'tuto-visual' }, [cardFace(MINE, 'small', false, ['sport']), el('span', { class: 'tuto-vs', text: 'VS' }), cardFace(THEIRS, 'small', false, ['sport'])]),
  },
  {
    title: 'Le plus rapide gagne',
    text: 'Écris vite un mot qui commence par la lettre, dans la catégorie commune. Le gagnant se débarrasse de son tas : c’est le perdant qui ramasse toutes les cartes du duel !',
    visual: () => el('div', { class: 'tuto-visual column' }, [el('div', { class: 'tuto-input' }, [el('span', { text: 'T' }), el('span', { class: 'typed', text: 'ennis' }), el('span', { class: 'go', text: 'GO !' })]), el('div', { class: 'tuto-big', text: '✅ Tennis !' })]),
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
