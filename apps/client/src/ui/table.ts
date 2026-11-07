/**
 * La table de jeu, sur tout l'écran : adversaires en bandeau en haut, lettre en
 * badge dans la barre, le tapis avec les tas de chacun (cartes aussi grandes que
 * la place le permet), son paquet en bas, et le panneau de duel. Cinématiques :
 * tirage de la lettre en plein écran, cartes qui volent, face-à-face « VS ».
 */
import { CARD_GAME, CATEGORIES, type CategoryId, type Duel, type GameEvent, type GameView, type PlayerView } from '@jeu-ville/shared';
import type { TableLink } from '../net/tableLink.js';
import { cardBack, cardFace, cardSlot } from './cardView.js';
import { el, showToast } from './dom.js';
import { confetti, muteButton, play } from './fx.js';
import { showRules } from './rules.js';

/** Défilement des lettres pendant le tirage (ms entre deux lettres). */
const ROLL_STEP_MS = 70;
/** La lettre s'arrête un peu avant la fin du tirage. */
const ROLL_STOP_BEFORE_MS = 700;
/**
 * Vibrations (ms : vibre, pause, vibre…). Bonne réponse : deux petits coups
 * joyeux ; mauvaise réponse : un long « bzzz » ; début de duel : un coup.
 * Sans effet là où le navigateur ne sait pas vibrer (iPhone, ordinateur).
 */
const VIBRATION = {
  duel: [200],
  right: [60, 60, 60],
  wrong: [400],
} as const;

function vibrate(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    /* vibration indisponible */
  }
}

/** Cinématique « VS » d'un duel (ms, voir .cine-vs dans styles.css) : hors temps de réponse. */
const VS_MS = CARD_GAME.timing.duelIntroMs;
/** La lettre tirée vole vers son badge (ms). */
const LETTER_FLY_MS = 450;
/** Tapis : taille des cartes (largeur, px) entre ces bornes, et écarts. */
const PILE_MIN_W = 56;
const PILE_MAX_W = 210;
const PILE_GAP = 14;
/** Marge par tas (badges qui dépassent, cartes du dessous décalées). */
const PILE_SLACK = 10;
/** On préfère les tas côte à côte s'ils ne sont pas plus de 25 % plus petits. */
const SIDE_BY_SIDE_BONUS = 1.25;
/** Hauteur réservée sous chaque tas (nom du joueur). */
const PILE_LABEL_H = 30;
/** En dessous de cette largeur, les cartes du tapis n'affichent que les icônes. */
const PILE_TINY_W = 84;
/** Durée du tampon « DUEL ! » (ms, voir .stamp dans styles.css). */
const STAMP_MS = 1_100;
/** Fin de duel : minuteur en alerte et « tic » chaque seconde. */
const URGENT_MS = 4_000;
/** Tas : nombre max de cartes dessinées sous celle du dessus. */
const PILE_LAYERS = 3;
/** Cartes qui volent (ms) : durée du vol (voir .flying dans styles.css), écart entre deux cartes… */
const FLY_DURATION_MS = 600;
const FLY_STEP_MS = 90;
const FLY_STAGGER_MS = 150;
/** … et le tas du gagnant part juste après celui du perdant. */
const FLY_WINNER_DELAY_MS = 250;
/** Au plus tant de cartes animées par tas (au-delà, on ne voit pas la différence). */
const FLY_MAX_CARDS = 6;

const AVATAR_COLORS = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#8338ec', '#fb8500'];

export function showTable(root: HTMLElement, link: TableLink, onExit: () => void): void {
  let view: GameView | null = null;
  let deadline = 0;
  let rolling = 0;
  /** Résultat de la dernière manche, par joueur (badge sur son siège). */
  let badges = new Map<string, string>();
  let duelPanelFor = 0;
  let selectedCategory: CategoryId | null = null;
  /** Dernière carte affichée sur chaque pile (pour n'animer que les nouvelles). */
  const shownTop = new Map<string, number>();

  const quit = el('button', { class: 'icon-button', text: '✕', title: 'Quitter la table' });
  const help = el('button', { class: 'icon-button', text: '?', title: 'Règles' });
  const roundLabel = el('div', { class: 'round-label' });
  const timer = el('div', { class: 'timer' });
  const opponents = el('div', { class: 'opponents' });
  /** Le tapis, au milieu : le tas de chaque joueur, comme à la bataille. */
  const tapis = el('div', { class: 'tapis' });
  /** La lettre de la manche, en badge dans la barre du haut. */
  const letterBadge = el('div', { class: 'letter-badge' }, [el('span', { class: 'letter-label', text: 'Lettre' }), el('span', { class: 'letter' })]);
  const status = el('div', { class: 'status' });
  const stage = el('div', { class: 'stage' }, [tapis, status]);
  const mySeat = el('div', { class: 'my-seat' });
  const duelPanel = el('div', { class: 'duel-panel', hidden: '' });
  const overlay = el('div', { class: 'overlay table-overlay', hidden: '' });
  const screen = el('div', { class: 'table-screen' }, [
    el('div', { class: 'topbar' }, [quit, roundLabel, letterBadge, timer, muteButton('icon-button'), help]),
    opponents,
    stage,
    mySeat,
    duelPanel,
    overlay,
  ]);
  root.append(screen);

  const letterEl = letterBadge.querySelector('.letter')!;
  const me = () => view?.players.find((p) => p.id === link.myId);
  const myDuel = () => view?.duels.find((d) => d.winnerId === null && d.playerIds.includes(link.myId));
  const nameOf = (id: string) => (id === link.myId ? 'Toi' : (view?.players.find((p) => p.id === id)?.name ?? '?'));

  quit.addEventListener('click', () => {
    link.leave();
    screen.remove();
    onExit();
  });
  help.addEventListener('click', () => showRules(root));

  // ---------- Rendu ----------

  /** Siège d'un joueur : son nom et son paquet (face cachée). */
  const seat = (p: PlayerView, big: boolean): HTMLElement => {
    const node = el('div', { class: `seat${big ? ' mine' : ''}${p.left ? ' left' : ''}${p.rank === 1 ? ' winner' : ''}` });
    node.dataset.player = p.id;
    const avatar = avatarOf(p);
    const size = 'small';
    node.append(
      el('div', { class: 'who' }, [
        avatar,
        el('div', { class: 'name', text: p.id === link.myId ? `${p.name} (toi)` : p.name }),
        ...(big ? [el('div', { class: 'seat-info', text: `${p.deckCount} carte${p.deckCount > 1 ? 's' : ''} en main · ${p.pileCount} sur ton tas` })] : []),
      ]),
      el('div', { class: 'deck' }, [p.deckCount > 0 ? cardBack(size) : cardSlot(size), el('span', { class: 'count', text: String(p.deckCount) })]),
    );
    return node;
  };

  /** Tas d'un joueur sur le tapis : les cartes posées, celle du dessus visible. */
  const pileTile = (p: PlayerView): HTMLElement => {
    const duel = view?.duels.find((d) => d.playerIds.includes(p.id));
    const inDuel = !!duel && duel.winnerId === null;
    const node = el('div', { class: `pile-tile${inDuel ? ' in-duel' : ''}${p.id === link.myId ? ' mine' : ''}` });
    node.dataset.player = p.id;
    const fresh = !!p.top && shownTop.get(p.id) !== p.top.id;
    shownTop.set(p.id, p.top?.id ?? 0);
    // Épaisseur du tas : quelques cartes décalées sous celle du dessus.
    const under = Math.min(Math.max(0, p.pileCount - 1), PILE_LAYERS);
    const stack = el('div', { class: 'heap' }, [
      ...Array.from({ length: under }, (_, k) => {
        const layer = el('div', { class: 'card back small layer' });
        layer.style.transform = `translate(${(k + 1) * 2}px, ${(k + 1) * 2}px) rotate(${((hash(p.id) + k * 7) % 9) - 4}deg)`;
        return layer;
      }),
      p.top ? cardFace(p.top, 'small', fresh) : cardSlot('small'),
    ]);
    if (p.pileCount > 0) stack.append(el('span', { class: 'count', text: String(p.pileCount) }));
    const label = el('div', { class: 'pile-name', text: p.id === link.myId ? 'Toi' : p.name });
    label.style.background = colorOf(p.id);
    node.append(stack, label);
    if (inDuel) node.append(el('div', { class: 'duel-tag', text: '⚔️' }));
    const badge = badges.get(p.id);
    if (badge) node.append(el('div', { class: 'badge', text: badge }));
    return node;
  };

  const render = () => {
    if (!view) return;
    roundLabel.textContent = view.round > 0 ? `Manche ${view.round}` : 'Bac Bataille';
    opponents.replaceChildren(...view.players.filter((p) => p.id !== link.myId).map((p) => seat(p, false)));
    const mine = me();
    mySeat.replaceChildren(...(mine ? [seat(mine, true)] : []));
    tapis.replaceChildren(...view.players.filter((p) => p.rank === null || p.pileCount > 0).map(pileTile));
    tapis.hidden = view.phase === 'waiting' || view.phase === 'finished';
    if (!rolling) letterEl.textContent = view.letter || '?';
    letterBadge.classList.toggle('dim', view.phase === 'waiting' || view.phase === 'finished' || !!rolling);
    fitTapis();
    renderDuelPanel();
    renderOverlay();
  };

  const renderDuelPanel = () => {
    const duel = myDuel();
    const top = me()?.top;
    screen.classList.toggle('with-duel', !!duel && !!top && view?.phase === 'duel');
    if (!duel || !top || view?.phase !== 'duel') {
      duelPanel.hidden = true;
      duelPanelFor = 0;
      return;
    }
    if (duelPanelFor === duel.id) return;
    duelPanelFor = duel.id;
    selectedCategory = duel.categories[0] ?? null;
    const rivals = duel.playerIds.filter((id) => id !== link.myId).map(nameOf).join(', ');
    const input = el('input', { type: 'text', maxlength: String(CARD_GAME.answer.maxLength), placeholder: `Un mot en ${view.letter}…`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const send = el('button', { class: 'primary send', text: 'GO !' });
    const feedback = el('div', { class: 'feedback' });
    const choices = duel.categories.map((c) => {
      const b = el('button', { class: `choice${c === selectedCategory ? ' selected' : ''}`, type: 'button' }, [el('span', { class: 'medal', text: CATEGORIES[c].icon }), el('span', { text: CATEGORIES[c].label })]);
      b.addEventListener('click', () => {
        selectedCategory = c;
        for (const x of choices) x.classList.toggle('selected', x === b);
        input.focus();
      });
      return b;
    });
    const submit = () => {
      const text = input.value.trim();
      if (!text || !selectedCategory) return;
      link.answer(selectedCategory, text);
      input.select();
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    duelPanel.replaceChildren(
      el('div', { class: 'duel-title' }, [
        el('div', {}, [el('div', { class: 'duel-word', text: 'Duel !' }), el('div', { class: 'duel-vs', text: `contre ${rivals}` })]),
        el('span', { class: 'duel-letter', text: view.letter }),
      ]),
      duelTimer(),
      el('div', { class: 'choices' }, choices),
      el('div', { class: 'answer-row' }, [input, send]),
      feedback,
    );
    duelPanel.hidden = false;
    input.focus();
  };

  /** Barre de temps du duel : elle se vide jusqu'à la fin du duel. */
  const duelTimer = () => {
    const bar = el('i');
    const left = Math.max(0, deadline - Date.now());
    bar.style.width = `${Math.min(100, (left / (CARD_GAME.timing.duelIntroMs + CARD_GAME.timing.duelMs)) * 100)}%`;
    requestAnimationFrame(() => {
      bar.style.transition = `width ${left}ms linear`;
      bar.style.width = '0%';
    });
    return el('div', { class: 'duel-timer' }, [bar]);
  };

  /** Gros tampon au milieu de l'écran (« DUEL ! », « GAGNÉ ! »). */
  const stamp = (text: string, kind: 'duel' | 'win' | 'lose') => {
    const node = el('div', { class: `stamp ${kind}`, text });
    screen.append(node);
    window.setTimeout(() => node.remove(), STAMP_MS);
  };

  const renderOverlay = () => {
    if (!view) return;
    if (view.phase === 'waiting' && link.mode === 'online') {
      overlay.hidden = false;
      const left = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
      overlay.replaceChildren(
        el('div', { class: 'panel' }, [
          el('h2', { class: 'title', text: 'Table en ligne' }),
          el('p', {
            text:
              view.players.length < CARD_GAME.players.min
                ? 'En attente d’autres joueurs… Invite tes amis : ils choisissent « Jouer en ligne ».'
                : `La partie commence dans ${left} s`,
          }),
          el('ul', { class: 'names' }, view.players.map((p) => el('li', {}, [avatarOf(p), el('span', { text: `${p.name}${p.id === link.myId ? ' (toi)' : ''}` })]))),
          el('p', { class: 'muted', text: `${view.players.length}/${CARD_GAME.players.max} joueurs` }),
        ]),
      );
    } else if (view.phase === 'finished') {
      overlay.hidden = false;
      const medals = ['🥇', '🥈', '🥉'];
      const myRank = view.ranking.find((r) => r.id === link.myId)?.rank;
      const again = el('button', { class: 'primary', text: '🔁 Revanche' });
      const menu = el('button', { text: 'Menu' });
      again.addEventListener('click', () => link.restart());
      menu.addEventListener('click', () => quit.click());
      const left = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
      overlay.replaceChildren(
        el('div', { class: 'panel' }, [
          el('h2', { class: 'title', text: myRank === 1 ? 'Victoire !' : 'Partie terminée' }),
          el('p', { class: 'subtitle', text: myRank === 1 ? 'Tu as vidé ton paquet le premier 🏆' : `Tu finis ${myRank ?? '?'}${myRank === 1 ? 'er' : 'e'}. Revanche ?` }),
          el(
            'ol',
            { class: 'ranking' },
            view.ranking.map((r) =>
              el('li', { class: `${r.id === link.myId ? 'me' : ''} rank-${r.rank}` }, [
                el('span', { class: 'medal-rank', text: medals[r.rank - 1] ?? `${r.rank}` }),
                el('span', { class: 'who-rank', text: nameOf(r.id) }),
                el('span', { text: r.cards === 0 ? 'plus de cartes !' : `${r.cards} carte${r.cards > 1 ? 's' : ''}` }),
              ]),
            ),
          ),
          link.mode === 'online' ? el('p', { class: 'muted', text: `Nouvelle partie à cette table dans ${left} s` }) : '',
          el('div', { class: 'actions' }, link.mode === 'solo' ? [menu, again] : [menu]),
        ]),
      );
    } else {
      overlay.hidden = true;
    }
  };

  const tickTimer = () => {
    const left = Math.max(0, deadline - Date.now());
    const duel = view?.phase === 'duel';
    timer.textContent = view && (duel || view.phase === 'waiting') && deadline > 0 ? `⏱️ ${Math.ceil(left / 1000)}` : '';
    timer.classList.toggle('urgent', duel && left < URGENT_MS);
    const second = Math.ceil(left / 1000);
    if (duel && left < URGENT_MS && left > 0 && second !== lastTick && myDuel()) play('tick');
    lastTick = second;
    if (view && (view.phase === 'waiting' || view.phase === 'finished')) renderOverlay();
  };
  let lastTick = 0;
  window.setInterval(tickTimer, 250);

  const avatarOf = (p: PlayerView) => {
    const a = el('div', { class: 'avatar', text: p.bot ? '🤖' : p.name.slice(0, 1).toUpperCase() });
    a.style.background = colorOf(p.id);
    return a;
  };

  // ---------- Lettre tirée au sort ----------

  /** Cinématique du tirage : grande roue au milieu de l'écran, puis la lettre file dans son badge. */
  const rollLetter = (letter: string) => {
    window.clearInterval(rolling);
    screen.querySelector('.cine-letter')?.remove();
    const big = el('span', { class: 'letter' });
    const wheel = el('div', { class: 'wheel spinning' }, [el('div', { class: 'rays' }), el('div', { class: 'disc' }, [el('span', { class: 'letter-label', text: 'Lettre' }), big])]);
    const cine = el('div', { class: 'cine-letter' }, [wheel]);
    screen.append(cine);
    const pool = CARD_GAME.letters;
    rolling = window.setInterval(() => {
      big.textContent = pool[Math.floor(Math.random() * pool.length)]!;
      play('tick');
    }, ROLL_STEP_MS * 2);
    letterBadge.classList.add('dim');
    window.setTimeout(() => {
      window.clearInterval(rolling);
      big.textContent = letter;
      wheel.classList.remove('spinning');
      wheel.classList.add('pop');
      play('letter');
      // La roue rétrécit et file vers le badge de la barre du haut.
      window.setTimeout(() => {
        const from = wheel.getBoundingClientRect();
        const to = letterBadge.getBoundingClientRect();
        wheel.style.transition = `transform ${LETTER_FLY_MS}ms cubic-bezier(0.5, 0, 0.3, 1), opacity ${LETTER_FLY_MS}ms`;
        wheel.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${to.width / from.width})`;
        cine.classList.add('leaving');
        window.setTimeout(() => {
          cine.remove();
          rolling = 0;
          letterEl.textContent = letter;
          letterBadge.classList.remove('dim');
          letterBadge.classList.remove('pop');
          void letterBadge.offsetWidth;
          letterBadge.classList.add('pop');
        }, LETTER_FLY_MS);
      }, ROLL_STOP_BEFORE_MS - LETTER_FLY_MS - 50);
    }, CARD_GAME.timing.letterMs - ROLL_STOP_BEFORE_MS);
  };

  /** Cinématique « VS » : les cartes du duel en grand, face à face, et la catégorie commune en énorme. */
  const showVersus = (d: Duel) => {
    const players = d.playerIds.map((id) => view?.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p?.top);
    if (players.length < 2) return;
    const [mine, ...others] = [...players].sort((a, b) => (a.id === link.myId ? -1 : b.id === link.myId ? 1 : 0));
    const side = (p: PlayerView, k: number) => {
      const card = cardFace(p.top!, 'small');
      return el('div', { class: `vs-side side-${k}` }, [card, el('div', { class: 'vs-name', text: p.id === link.myId ? 'Toi' : p.name })]);
    };
    const cats = d.categories.map((c) => el('div', { class: 'vs-cat' }, [el('span', { class: 'vs-medal', text: CATEGORIES[c].icon }), el('span', { text: CATEGORIES[c].label })]));
    const cine = el('div', { class: 'cine-vs' }, [
      el('div', { class: 'vs-cards' }, [side(mine!, 0), el('div', { class: 'vs-badge', text: 'VS' }), ...others.slice(0, 2).map((p, k) => side(p, k + 1))]),
      el('div', { class: 'vs-cats' }, [el('div', { class: 'vs-hint', text: `Un mot en ${view?.letter ?? ''} !` }), ...cats]),
    ]);
    screen.append(cine);
    window.setTimeout(() => cine.remove(), VS_MS);
  };

  /** Taille des cartes du tapis : la plus grande qui fasse tenir tous les tas dans la place libre. */
  const fitTapis = () => {
    const n = tapis.children.length;
    if (n === 0 || tapis.hidden) return;
    // Place intérieure réelle du tapis (sans bordure ni marges intérieures).
    const css = getComputedStyle(tapis);
    const W = tapis.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const H = tapis.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    let best = PILE_MIN_W;
    let bestScore = 0;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      // Marge par tas : badges qui dépassent et cartes du dessous décalées.
      const byW = (W - (cols - 1) * PILE_GAP) / cols - PILE_SLACK;
      const byH = (H - rows * PILE_LABEL_H - (rows - 1) * PILE_GAP) / rows / 1.4 - PILE_SLACK;
      // Côte à côte plutôt qu'empilés, même un peu plus petits : on voit mieux qui affronte qui.
      const score = Math.min(byW, byH) * (cols >= rows ? SIDE_BY_SIDE_BONUS : 1);
      if (score > bestScore) [best, bestScore] = [Math.min(byW, byH), score];
    }
    const w = Math.floor(Math.max(PILE_MIN_W, Math.min(PILE_MAX_W, best)));
    tapis.style.setProperty('--pile-w', `${w}px`);
    tapis.classList.toggle('tiny', w < PILE_TINY_W);
  };
  new ResizeObserver(() => fitTapis()).observe(stage);

  // ---------- Partie ----------

  link.onView((v) => {
    view = v;
    deadline = v.endsInMs > 0 ? Date.now() + v.endsInMs : 0;
    render();
    tickTimer();
  });

  link.onEvent((e: GameEvent) => {
    switch (e.kind) {
      case 'letter':
        badges = new Map();
        if (e.changed) {
          status.textContent = 'Tirage de la lettre…';
          rollLetter(e.letter);
        } else {
          // Pas de duel à la manche d'avant : on garde la même lettre.
          status.textContent = `Toujours la lettre ${e.letter} !`;
          letterBadge.classList.remove('pop');
          void letterBadge.offsetWidth;
          letterBadge.classList.add('pop');
        }
        break;
      case 'reveal':
        status.textContent = 'Cartes posées !';
        play('flip');
        // Chacun pose la carte du dessus de son paquet sur son tas, au milieu.
        for (const p of view?.players ?? []) {
          if (p.deckCount > 0 && p.rank === null) flyCards(deckEl(p.id), pileEl(p.id), 1, 0);
        }
        break;
      case 'noDuel':
        status.textContent = 'Aucune catégorie en commun… on continue !';
        break;
      case 'duels': {
        const mine = e.duels.some((d) => d.playerIds.includes(link.myId));
        status.textContent = e.duels.map((d) => `⚔️ ${d.playerIds.map(nameOf).join(' vs ')} · ${d.categories.map((c) => `${CATEGORIES[c].icon} ${CATEGORIES[c].label}`).join(' ou ')}`).join('\n');
        if (mine) {
          showVersus(e.duels.find((d) => d.playerIds.includes(link.myId))!);
          play('duel');
          vibrate(VIBRATION.duel);
        }
        break;
      }
      case 'duelWon':
        onDuelWon(e.duel);
        break;
      case 'duelTimeout':
        status.textContent = `⏱️ Personne n’a trouvé (${e.duel.playerIds.map(nameOf).join(' vs ')}) : les cartes restent.`;
        break;
      case 'finished':
        if (e.ranking[0]?.id === link.myId) {
          play('fanfare');
          confetti();
          window.setTimeout(() => confetti(), 600);
        } else play('lose');
        badges = new Map();
        status.textContent = '';
        break;
      case 'waiting':
        badges = new Map();
        status.textContent = '';
        break;
    }
    render();
  });

  const onDuelWon = (d: Duel) => {
    // Les tas du gagnant et des perdants partent dans le paquet du perdant.
    const piles = (id: string) => view?.players.find((p) => p.id === id)?.pileCount ?? 0;
    const winnerPile = piles(d.winnerId!);
    d.losers.forEach((l, k) => {
      const target = deckEl(l.id);
      flyCards(pileEl(l.id), target, Math.min(piles(l.id), FLY_MAX_CARDS), k * FLY_STAGGER_MS);
      const share = Math.ceil(winnerPile / d.losers.length);
      flyCards(pileEl(d.winnerId!), target, Math.min(share, FLY_MAX_CARDS), FLY_WINNER_DELAY_MS + k * FLY_STAGGER_MS);
    });
    const winner = nameOf(d.winnerId!);
    const cat = d.category ? CATEGORIES[d.category].label : '';
    const losers = d.losers.map((l) => `${nameOf(l.id)} récupère ${l.cards} carte${l.cards > 1 ? 's' : ''}`).join(', ');
    status.textContent = `🏆 ${winner} : « ${d.word} » (${cat}) · ${losers}`;
    badges.set(d.winnerId!, '🏆');
    for (const l of d.losers) badges.set(l.id, `+${l.cards}`);
    if (d.winnerId === link.myId) {
      stamp('BIEN JOUÉ !', 'win');
      showToast(screen, `« ${d.word} » ✅`, 'win');
      play('right');
      vibrate(VIBRATION.right);
      const r = pileEl(link.myId)?.getBoundingClientRect();
      confetti(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
    } else if (d.playerIds.includes(link.myId)) {
      showToast(screen, `😩 ${winner} a été plus rapide : « ${d.word} »`, 'error');
      play('lose');
    }
  };

  const deckEl = (id: string) => screen.querySelector(`.seat[data-player="${id}"] .deck`);
  const pileEl = (id: string) => screen.querySelector(`.pile-tile[data-player="${id}"] .heap`);

  /** Fait voler `count` cartes (dos) de `from` vers `to`, l'une après l'autre. */
  const flyCards = (from: Element | null, to: Element | null, count: number, delayMs: number) => {
    if (!from || !to || count <= 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    for (let k = 0; k < count; k++) {
      const ghost = el('div', { class: 'card back small flying' });
      ghost.style.setProperty('--w', `${Math.max(PILE_MIN_W, Math.round(Math.min(a.width, b.width, PILE_MAX_W)))}px`);
      ghost.style.left = `${a.left + a.width / 2}px`;
      ghost.style.top = `${a.top + a.height / 2}px`;
      document.body.append(ghost);
      window.setTimeout(() => {
        ghost.style.transform = `translate(calc(-50% + ${b.left + b.width / 2 - a.left - a.width / 2}px), calc(-50% + ${b.top + b.height / 2 - a.top - a.height / 2}px)) rotate(${(k % 2 ? 1 : -1) * 12}deg)`;
      }, delayMs + k * FLY_STEP_MS + 20);
      window.setTimeout(() => ghost.remove(), delayMs + k * FLY_STEP_MS + FLY_DURATION_MS + 60);
    }
  };

  link.onNotice((n) => {
    const feedback = duelPanel.querySelector('.feedback');
    if (feedback && !duelPanel.hidden && n.level === 'error') {
      feedback.textContent = `❌ ${n.text}`;
      vibrate(VIBRATION.wrong);
      play('wrong');
      duelPanel.classList.remove('shake');
      void duelPanel.offsetWidth;
      duelPanel.classList.add('shake');
    } else showToast(screen, n.text, n.level);
  });

  link.onDisconnected(() => {
    showToast(screen, 'Déconnecté du serveur.', 'error', 4000);
    window.setTimeout(() => quit.click(), 2000);
  });
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function colorOf(id: string): string {
  return AVATAR_COLORS[hash(id) % AVATAR_COLORS.length]!;
}
