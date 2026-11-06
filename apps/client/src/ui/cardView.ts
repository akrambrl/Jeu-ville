/** Dessin d'une carte (face visible ou dos), en DOM/CSS. */
import { CARD_COLOR_LABELS, CATEGORIES, type Card } from '@jeu-ville/shared';
import { el } from './dom.js';

/** `fresh` : la carte vient d'être posée (animation de retournement). */
export function cardFace(card: Card, size: 'big' | 'small' = 'small', fresh = false): HTMLElement {
  const [a, b] = card.categories;
  const line = (c: typeof a) => el('div', { class: 'cat' }, [el('span', { class: 'icon', text: CATEGORIES[c].icon }), el('span', { text: CATEGORIES[c].label })]);
  const node = el('div', { class: `card face ${size} color-${card.color}${fresh ? ' fresh' : ''}`, title: CARD_COLOR_LABELS[card.color].name }, [
    line(a),
    el('div', { class: 'slash', text: '/' }),
    line(b),
  ]);
  node.style.setProperty('--card', CARD_COLOR_LABELS[card.color].hex);
  return node;
}

export function cardBack(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card back ${size}` }, [el('span', { text: 'B' })]);
}

/** Emplacement vide (pas encore de pile). */
export function cardSlot(size: 'big' | 'small' = 'small'): HTMLElement {
  return el('div', { class: `card slot ${size}` });
}
