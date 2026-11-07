/**
 * Réglages : son, revoir le tutoriel, textes légaux, et suppression du compte
 * en ligne et des données de l'appareil (exigé par les stores et le RGPD).
 */
import { LEGAL_DOCS, type LegalDoc } from '../legal/texts.js';
import { api, tokenStore } from '../net/api.js';
import { el, showToast } from './dom.js';
import { isMuted, setMuted } from './fx.js';
import { showTutorial } from './tutorial.js';

export function showSettings(root: HTMLElement, options: { online: boolean }): void {
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
  const deleteAccount = el('button', { class: 'danger', text: '🗑️ Supprimer mon compte en ligne' });
  const clearDevice = el('button', { class: 'link', text: 'Effacer les données de cet appareil' });
  const close = el('button', { class: 'primary', text: 'Fermer' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel settings' }, [
      el('h2', { class: 'title', text: 'Réglages' }),
      el('div', { class: 'actions' }, [sound, tuto]),
      el('h3', { text: 'Infos' }),
      el('div', { class: 'legal-links' }, legal),
      el('h3', { text: 'Mes données' }),
      ...(options.online ? [deleteAccount] : []),
      clearDevice,
      close,
    ]),
  ]);
  tuto.addEventListener('click', () => {
    overlay.remove();
    showTutorial(root);
  });
  close.addEventListener('click', () => overlay.remove());

  deleteAccount.addEventListener('click', () =>
    confirmBox(root, 'Supprimer ton compte ?', 'Ton pseudo et ton compte en ligne seront définitivement effacés de nos serveurs. Tu pourras toujours jouer, avec un nouveau pseudo.', async () => {
      if (!tokenStore.get()) return showToast(root, 'Aucun compte en ligne sur cet appareil.', 'info');
      try {
        await api.deleteMe();
        tokenStore.clear();
        showToast(root, 'Compte supprimé.', 'win');
      } catch (err) {
        showToast(root, (err as Error).message, 'error');
      }
    }),
  );
  clearDevice.addEventListener('click', () =>
    confirmBox(root, 'Effacer cet appareil ?', 'Le pseudo, les réglages et la connexion enregistrés sur cet appareil seront effacés (ton compte en ligne, lui, n’est pas supprimé).', () => {
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
