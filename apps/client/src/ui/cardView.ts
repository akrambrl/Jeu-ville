/** Dessin d'une carte (face visible ou dos), en DOM/CSS : style « sticker » à contour épais. */
import { CARD_COLOR_LABELS, CATEGORIES, type Card, type CategoryId } from '@jeu-ville/shared';
import { el } from './dom.js';

const category = (c: CategoryId) =>
  el('div', { class: 'cat' }, [el('span', { class: 'medal', text: CATEGORIES[c].icon }), el('span', { class: 'label', text: CATEGORIES[c].label })]);

/** `fresh` : la carte vient d'être posée (animation de retournement). */
export function cardFace(card: Card, size: 'big' | 'small' = 'small', fresh = false): HTMLElement {
  const [a, b] = card.categories;
  const node = el('div', { class: `card face ${size}${fresh ? ' fresh' : ''}`, title: `${CATEGORIES[a].label} / ${CATEGORIES[b].label}` }, [
    el('div', { class: 'band' }, [el('span', { class: 'mono', text: 'BB' })]),
    category(a),
    el('div', { class: 'or', text: 'ou' }),
    category(b),
  ]);
  node.style.setProperty('--card', CARD_COLOR_LABELS[card.color].hex);
  return node;
}

export function cardBack(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card back ${size}` }, [el('span', { class: 'mono', text: 'BB' })]);
}

/** Emplacement vide (pas encore de tas). */
export function cardSlot(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card slot ${size}` });
}
