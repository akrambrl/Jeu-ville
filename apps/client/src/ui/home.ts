/** Écran d'accueil : pseudo, jouer en ligne ou contre des bots. */
import { CARD_GAME, PSEUDO_RULES } from '@jeu-ville/shared';
import { el } from './dom.js';
import { showRules } from './rules.js';

export type HomeChoice = { mode: 'online'; pseudo: string } | { mode: 'solo'; pseudo: string; bots: number };

const NAME_KEY = 'bac-bataille.pseudo';
const BOTS_KEY = 'bac-bataille.bots';

const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigation privée */
  }
};

/**
 * Affiche l'accueil. `start` lance la partie choisie ; s'il échoue (pseudo pris,
 * serveur injoignable), son message s'affiche et l'on reste sur l'accueil.
 */
export function showHome(root: HTMLElement, options: { online: boolean; error?: string }, start: (choice: HomeChoice) => Promise<void>): void {
  const input = el('input', { type: 'text', maxlength: String(PSEUDO_RULES.maxLength), autocomplete: 'nickname', placeholder: 'Ton pseudo', id: 'pseudo' });
  input.value = stored(NAME_KEY) ?? '';
  const error = el('div', { class: 'error', text: options.error ?? '' });
  let bots = Number(stored(BOTS_KEY)) || CARD_GAME.soloBots.default;
  const botCount = el('span', { class: 'bot-count' });
  const renderBots = () => (botCount.textContent = `${bots} bot${bots > 1 ? 's' : ''}`);
  renderBots();
  const minus = el('button', { class: 'round', text: '−', 'aria-label': 'Moins de bots' });
  const plus = el('button', { class: 'round', text: '+', 'aria-label': 'Plus de bots' });
  minus.addEventListener('click', () => {
    bots = Math.max(CARD_GAME.soloBots.min, bots - 1);
    renderBots();
  });
  plus.addEventListener('click', () => {
    bots = Math.min(CARD_GAME.soloBots.max, bots + 1);
    renderBots();
  });
  const onlineButton = el('button', { class: 'big online', text: '🌍 Jouer en ligne' });
  const soloButton = el('button', { class: 'big solo', text: '🤖 Jouer contre des bots' });
  const rulesButton = el('button', { class: 'link', text: '📖 Règles du jeu' });
  if (!options.online) {
    onlineButton.disabled = true;
    onlineButton.title = 'Le jeu en ligne n’est pas disponible ici';
  }

  const screen = el('div', { class: 'home' }, [
    el('div', { class: 'logo' }, [
      el('div', { class: 'logo-cards' }, ['red', 'blue', 'green', 'yellow'].map((c) => el('span', { class: `mini color-${c}` }))),
      el('h1', { text: 'Bac Bataille' }),
      el('p', { class: 'tagline', text: 'Le petit bac en cartes : sois le plus rapide, vide ton paquet !' }),
    ]),
    el('div', { class: 'panel' }, [
      el('label', { text: 'Ton pseudo', for: 'pseudo' }),
      input,
      error,
      onlineButton,
      el('div', { class: 'solo-row' }, [soloButton, el('div', { class: 'stepper' }, [minus, botCount, plus])]),
      rulesButton,
    ]),
  ]);
  root.append(screen);

  const go = async (mode: 'online' | 'solo') => {
    const pseudo = input.value.trim();
    if (pseudo.length < PSEUDO_RULES.minLength || !PSEUDO_RULES.pattern.test(pseudo)) {
      error.textContent = `Choisis un pseudo d’au moins ${PSEUDO_RULES.minLength} caractères (lettres, chiffres, - et _).`;
      return;
    }
    store(NAME_KEY, pseudo);
    store(BOTS_KEY, String(bots));
    error.textContent = '';
    onlineButton.disabled = soloButton.disabled = true;
    try {
      screen.remove();
      await start(mode === 'online' ? { mode, pseudo } : { mode, pseudo, bots });
    } catch (err) {
      showHome(root, { ...options, error: (err as Error).message }, start);
    }
  };
  onlineButton.addEventListener('click', () => void go('online'));
  soloButton.addEventListener('click', () => void go('solo'));
  rulesButton.addEventListener('click', () => showRules(root));
}
