import { el } from './dom.js';

const SEEN_KEY = 'jeu-ville.tutorial-seen';

/** Petit tutoriel affiché à la première partie. */
export function showTutorialOnce(root: HTMLElement, cityName: string): void {
  try {
    if (localStorage.getItem(SEEN_KEY)) return;
  } catch {
    /* stockage indisponible : on affiche quand même */
  }
  const ok = el('button', { class: 'primary', text: "C'est parti !" });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'card' }, [
      el('h1', { text: `Bienvenue à ${cityName} !` }),
      el('ul', {}, [
        el('li', { text: 'Touche (ou clique) le sol pour marcher. Glisse pour déplacer la vue ; à deux doigts (ou clic droit), tourne et zoome.' }),
        el('li', { text: 'Surveille tes jauges : faim, hygiène, apparence, santé. Elles baissent même quand tu n’es pas connecté.' }),
        el('li', { text: 'Le bouton 📍 Aller à… t’emmène chez toi, à la mairie, dans les squares… Chez toi, tu peux manger, te doucher et te changer.' }),
        el('li', { text: 'Ton bonheur dépend de tout le reste : garde-le haut !' }),
      ]),
      el('div', { class: 'actions' }, [ok]),
    ]),
  ]);
  ok.addEventListener('click', () => {
    overlay.remove();
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* rien */
    }
  });
  root.append(overlay);
}
