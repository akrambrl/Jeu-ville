/** Fenêtre des règles du jeu. */
import { CARD_GAME, CATEGORIES } from '@jeu-ville/shared';
import { el } from './dom.js';

export function showRules(root: HTMLElement): void {
  const close = el('button', { class: 'primary', text: 'Compris !' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel rules' }, [
      el('h2', { text: '📖 Règles' }),
      el('ol', {}, [
        el('li', { text: `Chacun reçoit ${CARD_GAME.cardsPerPlayer} cartes face cachée. Le but : se débarrasser de toutes ses cartes.` }),
        el('li', { text: 'À chaque manche, une lettre est tirée au hasard, puis tout le monde retourne en même temps la carte du dessus de son paquet.' }),
        el('li', { text: 'Chaque carte a une couleur et deux catégories (par exemple Prénom / Pays ou ville). À 2 joueurs il y a 2 couleurs, à 3 joueurs 3 couleurs, à partir de 4 joueurs 4 couleurs.' }),
        el('li', { text: 'Si ta carte a la même couleur que celle d’un autre joueur : ⚔️ DUEL ! Le premier qui écrit un mot qui commence par la lettre, dans une des deux catégories de SA carte, gagne.' }),
        el('li', { text: 'Le gagnant se débarrasse de sa pile : le perdant récupère les deux piles sous son paquet.' }),
        el('li', { text: 'Le premier qui n’a plus aucune carte gagne la partie !' }),
      ]),
      el('p', { class: 'muted', text: 'Accents, majuscules, articles et pluriels ne comptent pas. Les mots sont vérifiés avec la liste du jeu.' }),
      el('div', { class: 'chips' }, Object.values(CATEGORIES).map((c) => el('span', { class: 'chip', text: `${c.icon} ${c.label}` }))),
      el('div', { class: 'actions' }, [close]),
    ]),
  ]);
  close.addEventListener('click', () => overlay.remove());
  root.append(overlay);
}
