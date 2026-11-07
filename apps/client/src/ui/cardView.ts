/**
 * Dessin d'une carte (face visible ou dos), en DOM/CSS : style « sticker » à
 * contour épais. Chaque moitié de la carte prend la couleur de sa catégorie.
 */
import { CATEGORIES, type Card, type CategoryId } from '@jeu-ville/shared';
import { el } from './dom.js';

/** Applique la couleur d'une catégorie (variable CSS --cat) à un élément. */
export function tintCategory<T extends HTMLElement>(node: T, c: CategoryId): T {
  node.style.setProperty('--cat', CATEGORIES[c].color);
  return node;
}

const category = (c: CategoryId) =>
  tintCategory(el('div', { class: 'cat' }, [el('span', { class: 'medal', text: CATEGORIES[c].icon }), el('span', { class: 'label', text: CATEGORIES[c].label })]), c);

/** `fresh` : la carte vient d'être posée (animation de retournement). */
export function cardFace(card: Card, size: 'big' | 'small' = 'small', fresh = false): HTMLElement {
  const [a, b] = card.categories;
  const node = el('div', { class: `card face ${size}${fresh ? ' fresh' : ''}`, title: `${CATEGORIES[a].label} / ${CATEGORIES[b].label}` }, [
    category(a),
    el('div', { class: 'or', text: 'ou' }),
    category(b),
  ]);
  node.style.setProperty('--cat-a', CATEGORIES[a].color);
  node.style.setProperty('--cat-b', CATEGORIES[b].color);
  return node;
}

export function cardBack(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card back ${size}` }, [el('span', { class: 'mono', text: 'BB' })]);
}

/** Emplacement vide (pas encore de tas). */
export function cardSlot(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card slot ${size}` });
}
