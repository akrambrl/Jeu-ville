/** Écran d'accueil : pseudo, jouer en ligne ou contre des bots. */
import { CARD_GAME, PSEUDO_RULES, type Card } from '@jeu-ville/shared';
import { cardFace } from './cardView.js';
import { muteButton, play } from './fx.js';
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
    play('tap');
    bots = Math.max(CARD_GAME.soloBots.min, bots - 1);
    renderBots();
  });
  plus.addEventListener('click', () => {
    play('tap');
    bots = Math.min(CARD_GAME.soloBots.max, bots + 1);
    renderBots();
  });
  const onlineButton = el('button', { class: 'big online' }, [el('span', { class: 'b-icon', text: '🌍' }), el('span', { class: 'b-text' }, [el('strong', { text: 'Jouer en ligne' }), el('small', { text: 'contre de vrais joueurs' })])]);
  const soloButton = el('button', { class: 'big solo' }, [el('span', { class: 'b-icon', text: '🤖' }), el('span', { class: 'b-text' }, [el('strong', { text: 'Contre des bots' }), el('small', { text: 'entraîne-toi en solo' })])]);
  const rulesButton = el('button', { class: 'link', text: '📖 Comment on joue ?' });
  if (!options.online) {
    onlineButton.disabled = true;
    onlineButton.title = 'Le jeu en ligne n’est pas disponible ici';
  }

  const screen = el('div', { class: 'home' }, [
    floatingLetters(),
    muteButton('icon-button home-mute'),
    el('div', { class: 'logo' }, [
      el('div', { class: 'logo-cards' }, LOGO_CARDS.map((c) => cardFace(c))),
      el('h1', {}, [el('span', { class: 'word-bac', text: 'Bac' }), el('span', { class: 'word-bataille', text: 'Bataille' })]),
      el('p', { class: 'tagline', text: 'Le petit bac en cartes. Sois le plus rapide, vide ton paquet !' }),
    ]),
    el('div', { class: 'panel home-panel' }, [
      el('label', { text: 'Ton pseudo', for: 'pseudo' }),
      input,
      error,
      onlineButton,
      soloButton,
      el('div', { class: 'stepper' }, [el('span', { class: 'stepper-label', text: 'Adversaires' }), minus, botCount, plus]),
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
    play('letter');
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

/** Cartes en éventail du logo. */
const LOGO_CARDS: Card[] = [
  { id: -1, color: 'red', categories: ['firstName', 'place'] },
  { id: -2, color: 'blue', categories: ['animal', 'sport'] },
  { id: -3, color: 'yellow', categories: ['fruitVeg', 'celebrity'] },
];

/** Lettres qui flottent en fond d'écran. */
function floatingLetters(): HTMLElement {
  const layer = el('div', { class: 'floating-letters', 'aria-hidden': 'true' });
  const letters = CARD_GAME.letters;
  for (let k = 0; k < 14; k++) {
    const span = el('span', { text: letters[(k * 7) % letters.length]! });
    span.style.left = `${(k * 37) % 100}%`;
    span.style.animationDelay = `${-(k * 1.7)}s`;
    span.style.animationDuration = `${14 + (k % 5) * 3}s`;
    span.style.fontSize = `${28 + ((k * 13) % 40)}px`;
    layer.append(span);
  }
  return layer;
}
