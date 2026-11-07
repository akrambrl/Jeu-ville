/** Fenêtre des règles du jeu. */
import { CARD_GAME, CATEGORIES, CATEGORY_IDS } from '@jeu-ville/shared';
import { tintCategory } from './tiles.js';
import { showTutorial } from './tutorial.js';
import { el } from './dom.js';

export function showRules(root: HTMLElement): void {
  const close = el('button', { class: 'primary', text: 'Compris !' });
  const tuto = el('button', { text: '🎬 Voir le tuto' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel rules' }, [
      el('h2', { text: 'Comment on joue ?' }),
      el('ol', {}, [
        el('li', { text: `Chacun reçoit ${CARD_GAME.coins.start} pièces d’or. Le but : être le dernier à avoir encore des pièces.` }),
        el('li', { text: `À chaque manche, tout le monde pose sa mise au milieu : ${CARD_GAME.coins.ante} pièce au début, puis la mise monte de 1 toutes les ${CARD_GAME.coins.anteStepRounds} manches. Celui qui n’a plus assez pose ce qui lui reste.` }),
        el('li', { text: 'Une lettre est tirée au milieu de la table. Puis le rouleau des catégories tourne… et s’arrête sur la catégorie de la manche, la même pour tout le monde.' }),
        el('li', { text: 'Le premier qui écrit un mot qui commence par la lettre, dans la catégorie, rafle tout le tas de pièces.' }),
        el('li', { text: 'Personne ne trouve à temps ? Les pièces restent au milieu : la cagnotte grossit pour la manche suivante.' }),
        el('li', { text: 'Plus de pièce au moment de miser : éliminé. Le dernier qui a encore des pièces gagne la partie !' }),
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
