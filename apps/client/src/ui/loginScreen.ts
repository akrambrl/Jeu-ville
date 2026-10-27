import { PSEUDO_RULES } from '@jeu-ville/shared';
import { el } from './dom.js';

/**
 * Écran d'arrivée : choix du pseudo (pas de mot de passe dans le prototype).
 * `submitPseudo` valide le pseudo et rejette avec un message à afficher en cas d'échec.
 */
export function showLoginScreen(root: HTMLElement, submitPseudo: (pseudo: string) => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'text',
      maxlength: String(PSEUDO_RULES.maxLength),
      autocomplete: 'nickname',
      placeholder: 'Ton pseudo',
    });
    const error = el('div', { class: 'error' });
    const submit = el('button', { class: 'primary', type: 'submit', text: 'Jouer' });
    const form = el('form', {}, [
      el('h1', { text: 'Bienvenue dans le 93' }),
      el('p', { text: 'Fais vivre ton perso à Noisy-le-Sec et fais de ta ville la meilleure du 93.' }),
      el('label', { text: 'Choisis ton pseudo', for: 'pseudo' }),
      input,
      error,
      el('div', { class: 'actions' }, [submit]),
    ]);
    input.id = 'pseudo';
    const screen = el('div', { class: 'screen' }, [el('div', { class: 'card' }, [form])]);
    root.append(screen);
    input.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      try {
        await submitPseudo(input.value.trim());
        screen.remove();
        resolve();
      } catch (err) {
        error.textContent = (err as Error).message;
        submit.disabled = false;
      }
    });
  });
}
