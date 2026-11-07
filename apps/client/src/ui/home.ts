/** Écran d'accueil : pseudo, jouer en ligne ou contre des bots. */
import { CARD_GAME, ONLINE, PSEUDO_RULES, containsBannedWord } from '@jeu-ville/shared';
import { showSettings } from './settings.js';
import { categoryTile, coin } from './tiles.js';
import { muteButton, play } from './fx.js';
import { el } from './dom.js';
import { showRules } from './rules.js';

/** Table en ligne : partie rapide, nouvelle table privée, ou table d'un ami (code). */
export type OnlineTable = { kind: 'quick' } | { kind: 'create' } | { kind: 'join'; code: string };

export type HomeChoice = { mode: 'online'; pseudo: string; table: OnlineTable } | { mode: 'solo'; pseudo: string; bots: number };

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
export interface HomeOptions {
  online: boolean;
  error?: string;
  /** Code reçu dans un lien d'invitation (?table=CODE). */
  inviteCode?: string | null;
}

export function showHome(root: HTMLElement, options: HomeOptions, start: (choice: HomeChoice) => Promise<void>): void {
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
  const settingsButton = el('button', { class: 'icon-button', text: '⚙️', title: 'Réglages' });
  settingsButton.addEventListener('click', () => showSettings(root));
  if (!options.online) {
    onlineButton.disabled = true;
    onlineButton.title = 'Le jeu en ligne n’est pas disponible ici';
  }

  const screen = el('div', { class: 'home' }, [
    floatingLetters(),
    el('div', { class: 'home-tools' }, [muteButton('icon-button'), settingsButton]),
    el('div', { class: 'logo' }, [
      el('div', { class: 'logo-reels' }, [categoryTile('animal', 'landed'), el('div', { class: 'logo-coins' }, [coin(), coin(), coin()]), categoryTile('animal', 'landed')]),
      el('h1', {}, [el('span', { class: 'word-bac', text: 'Bac' }), el('span', { class: 'word-bataille', text: 'Bataille' })]),
      el('p', { class: 'tagline', text: 'Le petit bac version casino. Sois le plus rapide, rafle tout l’or !' }),
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

  const pseudoOk = () => {
    const pseudo = input.value.trim();
    if (pseudo.length < PSEUDO_RULES.minLength || !PSEUDO_RULES.pattern.test(pseudo)) {
      error.textContent = `Choisis un pseudo d’au moins ${PSEUDO_RULES.minLength} caractères (lettres, chiffres, - et _).`;
      return false;
    }
    if (containsBannedWord(pseudo)) {
      error.textContent = 'Ce pseudo n’est pas autorisé : choisis-en un autre.';
      return false;
    }
    return true;
  };

  const go = async (mode: 'online' | 'solo', table: OnlineTable = { kind: 'quick' }) => {
    const pseudo = input.value.trim();
    if (!pseudoOk()) return;
    play('letter');
    store(NAME_KEY, pseudo);
    store(BOTS_KEY, String(bots));
    error.textContent = '';
    onlineButton.disabled = soloButton.disabled = true;
    try {
      screen.remove();
      await start(mode === 'online' ? { mode, pseudo, table } : { mode, pseudo, bots });
    } catch (err) {
      showHome(root, { ...options, error: (err as Error).message }, start);
    }
  };

  onlineButton.addEventListener('click', () => {
    if (!pseudoOk()) return;
    play('tap');
    showOnlineMenu(root, options.inviteCode ?? null, (table) => void go('online', table));
  });
  if (options.inviteCode && options.online) {
    error.textContent = '';
    onlineButton.querySelector('small')!.textContent = `invitation à la table ${options.inviteCode}`;
  }
  soloButton.addEventListener('click', () => void go('solo'));
  rulesButton.addEventListener('click', () => showRules(root));
}

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

/** Choix du mode en ligne : partie rapide, créer une table privée, rejoindre avec un code. */
function showOnlineMenu(root: HTMLElement, inviteCode: string | null, pick: (table: OnlineTable) => void): void {
  const quick = el('button', { class: 'big online' }, [el('span', { class: 'b-icon', text: '⚡' }), el('span', { class: 'b-text' }, [el('strong', { text: 'Partie rapide' }), el('small', { text: 'avec des joueurs au hasard' })])]);
  const create = el('button', { class: 'big private' }, [el('span', { class: 'b-icon', text: '🔒' }), el('span', { class: 'b-text' }, [el('strong', { text: 'Table entre amis' }), el('small', { text: 'crée une table et partage son code' })])]);
  const code = el('input', { type: 'text', maxlength: String(ONLINE.codeLength), placeholder: 'CODE', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'code-input' });
  code.value = inviteCode ?? '';
  const join = el('button', { class: 'primary', text: 'Rejoindre' });
  const close = el('button', { class: 'link', text: 'Annuler' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'panel' }, [
      el('h2', { class: 'title', text: 'Jouer en ligne' }),
      quick,
      create,
      el('label', { text: 'Tu as un code ?', for: 'table-code' }),
      el('div', { class: 'answer-row' }, [code, join]),
      close,
    ]),
  ]);
  code.id = 'table-code';
  const done = (table: OnlineTable) => {
    overlay.remove();
    pick(table);
  };
  quick.addEventListener('click', () => done({ kind: 'quick' }));
  create.addEventListener('click', () => done({ kind: 'create' }));
  const submit = () => {
    const value = code.value.trim().toUpperCase();
    if (value.length === ONLINE.codeLength) done({ kind: 'join', code: value });
    else code.focus();
  };
  join.addEventListener('click', submit);
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  close.addEventListener('click', () => overlay.remove());
  root.append(overlay);
  if (inviteCode) join.focus();
}
