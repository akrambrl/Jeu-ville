/**
 * Réglages : son, revoir le tutoriel, textes légaux, et effacement des données
 * de l'appareil. Il n'y a pas de compte : rien n'est stocké ailleurs que sur
 * le téléphone (le pseudo ne fait que passer par le canal de la table).
 */
import { LEGAL_DOCS, type LegalDoc } from '../legal/texts.js';
import { el, showToast } from './dom.js';
import { isMuted, setMuted } from './fx.js';
import { showTutorial } from './tutorial.js';

export function showSettings(root: HTMLElement): void {
  const sound = el('button', { text: isMuted() ? '🔇 Son coupé' : '🔊 Son activé' });
  sound.addEventListener('click', () => {
    setMuted(!isMuted());
    sound.textContent = isMuted() ? '🔇 Son coupé' : '🔊 Son activé';
  });
  const tuto = el('button', { text: '🎬 Revoir le tuto' });
  const legal = LEGAL_DOCS.map((doc) => {
    const b = el('button', { class: 'link', text: doc.title });
    b.addEventListener('click', () => showLegal(root, doc));
    return b;
  });
  const clearDevice = el('button', { class: 'danger', text: '🗑️ Effacer mes données de cet appareil' });
  const close = el('button', { class: 'primary', text: 'Fermer' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel settings' }, [
      el('h2', { class: 'title', text: 'Réglages' }),
      el('div', { class: 'actions' }, [sound, tuto]),
      el('h3', { text: 'Infos' }),
      el('div', { class: 'legal-links' }, legal),
      el('h3', { text: 'Mes données' }),
      el('p', { class: 'muted', text: 'Pas de compte : ton pseudo et tes réglages restent sur ce téléphone. En ligne, ton pseudo n’est montré qu’aux joueurs de ta table et n’est enregistré nulle part.' }),
      clearDevice,
      close,
    ]),
  ]);
  tuto.addEventListener('click', () => {
    overlay.remove();
    showTutorial(root);
  });
  close.addEventListener('click', () => overlay.remove());

  clearDevice.addEventListener('click', () =>
    confirmBox(root, 'Effacer cet appareil ?', 'Ton pseudo, tes réglages et ton identifiant de joueur enregistrés sur cet appareil seront effacés.', () => {
      try {
        localStorage.clear();
      } catch {
        /* rien à effacer */
      }
      location.reload();
    }),
  );
  root.append(overlay);
}

/** Affiche un texte légal en plein écran. */
export function showLegal(root: HTMLElement, doc: LegalDoc): void {
  const close = el('button', { class: 'primary', text: 'Fermer' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel legal' }, [
      el('h2', { class: 'title', text: doc.title }),
      ...doc.sections.flatMap((s) => [el('h3', { text: s.heading }), ...s.paragraphs.map((p) => el('p', { text: p }))]),
      close,
    ]),
  ]);
  close.addEventListener('click', () => overlay.remove());
  root.append(overlay);
}

function confirmBox(root: HTMLElement, title: string, text: string, onYes: () => void | Promise<void>): void {
  const yes = el('button', { class: 'danger', text: 'Oui, effacer' });
  const no = el('button', { text: 'Annuler' });
  const overlay = el('div', { class: 'overlay' }, [el('div', { class: 'panel' }, [el('h2', { class: 'title', text: title }), el('p', { text }), el('div', { class: 'actions' }, [no, yes])])]);
  no.addEventListener('click', () => overlay.remove());
  yes.addEventListener('click', async () => {
    overlay.remove();
    await onYes();
  });
  root.append(overlay);
}
