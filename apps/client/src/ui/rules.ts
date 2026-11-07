/** Fenêtre des règles du jeu. */
import { CARD_GAME, CATEGORIES, CATEGORY_IDS } from '@jeu-ville/shared';
import { tintCategory } from './cardView.js';
import { showTutorial } from './tutorial.js';
import { el } from './dom.js';

export function showRules(root: HTMLElement): void {
  const close = el('button', { class: 'primary', text: 'Compris !' });
  const tuto = el('button', { text: '🎬 Voir le tuto' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel rules' }, [
      el('h2', { text: 'Comment on joue ?' }),
      el('ol', {}, [
        el('li', { text: `Chacun reçoit ${CARD_GAME.cardsPerPlayer} cartes face cachée. Le but : se débarrasser de toutes ses cartes.` }),
        el('li', { text: 'Une lettre est tirée au hasard, puis tout le monde retourne en même temps la carte du dessus de son paquet. On garde la même lettre tant qu’il n’y a pas de duel ; après chaque duel, on en tire une nouvelle.' }),
        el('li', { text: 'Chaque carte porte deux catégories (par exemple Prénom / Pays ou ville), chacune avec sa couleur : deux cartes avec une même couleur ont une catégorie en commun.' }),
        el('li', { text: 'Si ta carte a au moins une catégorie en commun avec celle d’un autre joueur : ⚔️ DUEL ! Le premier qui écrit un mot qui commence par la lettre, dans la catégorie commune, gagne.' }),
        el('li', { text: 'Le gagnant se débarrasse de sa pile : le perdant récupère les deux piles sous son paquet.' }),
        el('li', { text: 'Le premier qui n’a plus aucune carte gagne la partie !' }),
      ]),
      el('p', { class: 'muted', text: 'Accents, majuscules, articles et pluriels ne comptent pas, et une faute de frappe passe sur les mots de 5 lettres ou plus. Les mots sont vérifiés avec la liste du jeu.' }),
      el('div', { class: 'chips' }, CATEGORY_IDS.map((c) => tintCategory(el('span', { class: 'chip', text: `${CATEGORIES[c].icon} ${CATEGORIES[c].label}` }), c))),
      el('div', { class: 'actions' }, [tuto, close]),
    ]),
  ]);
  close.addEventListener('click', () => overlay.remove());
  tuto.addEventListener('click', () => {
    overlay.remove();
    showTutorial(root);
  });
  root.append(overlay);
}
