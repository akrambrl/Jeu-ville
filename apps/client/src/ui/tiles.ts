/**
 * Petits éléments dessinés en DOM/CSS, style « sticker » à contour épais :
 * tuile de catégorie (à la couleur de la catégorie) et pièce d'or.
 */
import { CATEGORIES, type CategoryId } from '@jeu-ville/shared';
import { el } from './dom.js';

/** Applique la couleur d'une catégorie (variable CSS --cat) à un élément. */
export function tintCategory<T extends HTMLElement>(node: T, c: CategoryId): T {
  node.style.setProperty('--cat', CATEGORIES[c].color);
  return node;
}

/** Contenu d'une tuile de catégorie : médaillon + nom. */
export function categoryFace(c: CategoryId): HTMLElement[] {
  return [el('span', { class: 'medal', text: CATEGORIES[c].icon }), el('span', { class: 'label', text: CATEGORIES[c].label })];
}

/** Tuile de catégorie (rouleau arrêté). */
export function categoryTile(c: CategoryId, extra = ''): HTMLElement {
  return tintCategory(el('div', { class: `cat-tile ${extra}`.trim() }, categoryFace(c)), c);
}

/** Une pièce d'or. */
export function coin(extra = ''): HTMLElement {
  return el('span', { class: `coin ${extra}`.trim() });
}
