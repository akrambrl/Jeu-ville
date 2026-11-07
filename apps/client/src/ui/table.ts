/**
 * La table de jeu, sur tout l'écran : adversaires en bandeau en haut (avec leur
 * bourse), lettre en badge dans la barre, le tapis avec le rouleau de catégories
 * de chaque joueur et le tas de pièces d'or au milieu, sa bourse en bas, et le
 * panneau de réponse. Cinématiques : pièces qui volent vers le tas puis vers le
 * gagnant, rouleaux qui défilent et s'arrêtent sur la même catégorie (« MATCH ! »).
 */
import { CARD_GAME, CATEGORIES, CATEGORY_IDS, type CategoryId, type GameEvent, type GameView, type PlayerView } from '@jeu-ville/shared';
import { haptic, isNative } from '../native.js';
import type { TableLink } from '../net/tableLink.js';
import { el, showToast } from './dom.js';
import { confetti, muteButton, play } from './fx.js';
import { showRules } from './rules.js';
import { categoryFace, coin, tintCategory } from './tiles.js';

/** Rouleaux : vitesse de défilement (ms entre deux catégories)… */
const REEL_STEP_MS = 90;
/** … le premier rouleau s'arrête à ce moment du défilement, les suivants l'un après l'autre… */
const REEL_FIRST_STOP_MS = 1_400;
const REEL_STOP_STEP_MS = 380;
/** … et tous sont arrêtés au plus tard tant de ms avant la fin du défilement. */
const REEL_DONE_BEFORE_MS = 450;
/** Durée du tampon (« MATCH ! », « RAFLÉ ! », voir .stamp dans styles.css). */
const STAMP_MS = 1_100;
/** Fin de manche : minuteur en alerte et « tic » chaque seconde. */
const URGENT_MS = 4_000;
/** Pièces qui volent (ms) : durée du vol (voir .coin.flying), écart entre deux pièces. */
const COIN_FLY_MS = 650;
const COIN_STEP_MS = 70;
/** Au plus tant de pièces animées par vol (au-delà, on ne voit pas la différence). */
const COIN_FLY_MAX = 8;
/** Pièces récupérées : au moins tant de tintements, joués un peu avant la fin du vol. */
const COIN_CLINKS_MIN = 3;
const COIN_CLINK_EARLY_MS = 120;
/** Pièces dessinées dans le tas du milieu (au-delà, seul le nombre change). */
const POT_DRAWN_MAX = 14;
/** Rouleaux : largeur des tuiles entre ces bornes (px), écart entre eux… */
const TILE_MIN_W = 36;
const TILE_MAX_W = 150;
const REEL_GAP = 12;
/** … place prise autour d'une tuile (cadre du rouleau, bordures comprises ; nom en dessous). */
const REEL_FRAME = 14;
const REEL_LABEL_H = 14;
/** La bourse et le nom débordent un peu sur les côtés du rouleau (voir .reel-tile .purse). */
const TAG_OVERFLOW = 12;
/** Le tas du milieu : largeur et hauteur réservées (voir .pot). */
const POT_W = 76;
const POT_H = 100;
/** Rapport hauteur / largeur d'une tuile (voir .cat-tile). */
const TILE_RATIO = 1.05;
/** En dessous de cette largeur, les tuiles n'affichent que le médaillon. */
const TILE_TINY_W = 66;
/**
 * Place des adversaires autour de la table, selon leur nombre (on est toujours
 * en bas) : 1 en face ; 2 à gauche et à droite ; 3 à gauche, en face, à droite…
 * Les places suivent l'ordre de la table, dans le sens des aiguilles d'une montre.
 */
const SEATING: Record<number, Side[]> = {
  1: ['top'],
  2: ['left', 'right'],
  3: ['left', 'top', 'right'],
  4: ['left', 'top', 'top', 'right'],
  5: ['left', 'top', 'top', 'top', 'right'],
};
type Side = 'top' | 'left' | 'right' | 'bottom';

const AVATAR_COLORS = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#8338ec', '#fb8500'];

export function showTable(root: HTMLElement, link: TableLink, onExit: () => void): void {
  let view: GameView | null = null;
  let deadline = 0;
  /** Défilement en cours : on ne touche pas aux rouleaux ni à la lettre. */
  let spinning = false;
  const timers: number[] = [];
  /** Résultat de la dernière manche, par joueur (badge sur son rouleau). */
  let badges = new Map<string, string>();
  let panelRound = 0;

  const quit = el('button', { class: 'icon-button', text: '✕', title: 'Quitter la table' });
  const help = el('button', { class: 'icon-button', text: '?', title: 'Règles' });
  const roundLabel = el('div', { class: 'round-label' });
  const timer = el('div', { class: 'timer' });
  /** Places autour du tapis : rouleau, nom et bourse de chaque joueur (soi en bas). */
  const sides: Record<Side, HTMLElement> = {
    top: el('div', { class: 'side side-top' }),
    left: el('div', { class: 'side side-left' }),
    right: el('div', { class: 'side side-right' }),
    bottom: el('div', { class: 'side side-bottom' }),
  };
  /** Le tas de pièces au milieu. */
  const potCoins = el('div', { class: 'pot-coins' });
  const potCount = el('div', { class: 'pot-count' });
  const pot = el('div', { class: 'pot' }, [potCoins, potCount]);
  const tapis = el('div', { class: 'tapis' }, [sides.top, sides.left, pot, sides.right, sides.bottom]);
  const letterBadge = el('div', { class: 'letter-badge' }, [el('span', { class: 'letter-label', text: 'Lettre' }), el('span', { class: 'letter' })]);
  const status = el('div', { class: 'status' });
  const stage = el('div', { class: 'stage' }, [tapis, status]);
  const mySeat = el('div', { class: 'my-seat' });
  const duelPanel = el('div', { class: 'duel-panel', hidden: '' });
  const overlay = el('div', { class: 'overlay table-overlay', hidden: '' });
  const screen = el('div', { class: 'table-screen' }, [
    el('div', { class: 'topbar' }, [quit, roundLabel, letterBadge, timer, muteButton('icon-button'), help]),
    stage,
    mySeat,
    duelPanel,
    overlay,
  ]);
  root.append(screen);

  const letterEl = letterBadge.querySelector('.letter')!;
  const me = () => view?.players.find((p) => p.id === link.myId);
  const nameOf = (id: string) => (id === link.myId ? 'Toi' : (view?.players.find((p) => p.id === id)?.name ?? '?'));
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

  quit.addEventListener('click', () => {
    for (const t of timers) window.clearTimeout(t);
    link.leave();
    screen.remove();
    onExit();
  });
  help.addEventListener('click', () => showRules(root));

  // ---------- Rendu ----------

  /** Siège d'un joueur : avatar, nom et bourse (pièces d'or). */
  const seat = (p: PlayerView, big: boolean): HTMLElement => {
    const node = el('div', { class: `seat${big ? ' mine' : ''}${p.left ? ' left' : ''}${p.out ? ' out' : ''}${p.rank === 1 ? ' winner' : ''}` });
    node.dataset.player = p.id;
    node.append(
      el('div', { class: 'who' }, [
        avatarOf(p),
        el('div', { class: 'name', text: p.id === link.myId ? `${p.name} (toi)` : p.name }),
        ...(big ? [el('div', { class: 'seat-info', text: p.out ? 'Éliminé : plus de pièce' : 'Ta bourse' })] : []),
      ]),
      p.out ? el('div', { class: 'purse out', text: '💀' }) : el('div', { class: 'purse' }, [coin(), el('span', { text: String(p.coins) })]),
    );
    return node;
  };

  /** Rouleau d'un joueur sur le tapis, avec son nom et sa bourse (créé une fois : le défilement continue entre deux rendus). */
  const tiles = new Map<string, HTMLElement>();
  const reelTile = (p: PlayerView): HTMLElement => {
    const mine = p.id === link.myId;
    let node = tiles.get(p.id);
    if (!node) {
      node = el('div', { class: `reel-tile${mine ? ' mine' : ''}` }, [
        el('div', { class: 'reel' }, [el('div', { class: 'cat-tile empty' }, [el('span', { class: 'medal', text: '?' })])]),
        el('div', { class: 'reel-tag' }, [el('div', { class: 'reel-name' })]),
        ...(mine ? [] : [el('div', { class: 'purse' })]),
      ]);
      node.dataset.player = p.id;
      tiles.set(p.id, node);
    }
    node.classList.toggle('out', p.out);
    node.classList.toggle('left', p.left);
    const label = node.querySelector<HTMLElement>('.reel-name')!;
    label.textContent = mine ? 'Toi' : p.name;
    label.style.background = colorOf(p.id);
    const purse = node.querySelector<HTMLElement>('.purse');
    if (purse) {
      const text = p.out ? '💀' : String(p.coins);
      if (purse.textContent !== text) purse.replaceChildren(...(p.out ? [] : [coin()]), el('span', { text }));
      purse.classList.toggle('out', p.out);
    }
    node.querySelector('.badge')?.remove();
    const badge = badges.get(p.id);
    if (badge) node.append(el('div', { class: 'badge', text: badge }));
    return node;
  };

  /** Place chaque joueur autour du tapis : soi en bas, les autres dans l'ordre de la table. */
  const placeSeats = (players: PlayerView[]): boolean => {
    const k = Math.max(0, players.findIndex((p) => p.id === link.myId));
    const others = [...players.slice(k + 1), ...players.slice(0, k)].filter((p) => p.id !== link.myId);
    const layout = SEATING[others.length] ?? others.map(() => 'top' as Side);
    const wanted: Record<Side, HTMLElement[]> = { top: [], left: [], right: [], bottom: [] };
    others.forEach((p, i) => wanted[layout[i]!].push(reelTile(p)));
    const mine = players.find((p) => p.id === link.myId);
    if (mine) wanted.bottom.push(reelTile(mine));
    let moved = false;
    for (const side of Object.keys(sides) as Side[]) {
      const box = sides[side];
      if (wanted[side].length !== box.children.length || wanted[side].some((t, i) => box.children[i] !== t)) {
        box.replaceChildren(...wanted[side]);
        moved = true;
      }
    }
    return moved;
  };

  /** Affiche une catégorie (ou « ? ») dans un rouleau. */
  const setReel = (tile: Element | null, c: CategoryId | null, extra = '') => {
    const reel = tile?.querySelector('.reel');
    if (!reel) return;
    const face = c ? tintCategory(el('div', { class: `cat-tile ${extra}`.trim() }, categoryFace(c)), c) : el('div', { class: 'cat-tile empty' }, [el('span', { class: 'medal', text: '?' })]);
    face.dataset.cat = c ?? '';
    reel.replaceChildren(face);
  };

  /** Rouleaux des joueurs encore en lice. */
  const liveTiles = () => [...tapis.querySelectorAll<HTMLElement>('.reel-tile:not(.out)')];

  const render = () => {
    if (!view) return;
    roundLabel.textContent = view.round > 0 ? `Manche ${view.round}` : 'Bac Bataille';
    const mine = me();
    mySeat.replaceChildren(...(mine ? [seat(mine, true)] : []));
    const wasHidden = tapis.hidden;
    tapis.hidden = view.phase === 'waiting' || view.phase === 'finished';
    if (placeSeats(view.players) || wasHidden !== tapis.hidden) fitReels();
    if (!spinning) {
      const c = view.phase === 'spin' || view.phase === 'duel' || view.phase === 'result' ? view.category : null;
      for (const t of tapis.querySelectorAll<HTMLElement>('.reel-tile')) {
        const shown = t.querySelector<HTMLElement>('.reel .cat-tile');
        if (t.classList.contains('out')) {
          if (shown?.dataset.cat !== 'out') {
            const face = el('div', { class: 'cat-tile empty' }, [el('span', { class: 'medal', text: '💀' })]);
            face.dataset.cat = 'out';
            t.querySelector('.reel')!.replaceChildren(face);
          }
        } else if ((shown?.dataset.cat || null) !== c) setReel(t, c, 'landed');
      }
      letterEl.textContent = view.letter || '?';
    }
    renderPot(view.pot);
    letterBadge.classList.toggle('dim', view.phase === 'waiting' || view.phase === 'finished' || view.phase === 'ante' || (spinning && !letterBadge.classList.contains('rolling')));
    renderDuelPanel();
    renderOverlay();
  };

  const renderPot = (n: number) => {
    if (potCoins.childElementCount !== Math.min(n, POT_DRAWN_MAX)) {
      potCoins.replaceChildren(
        ...Array.from({ length: Math.min(n, POT_DRAWN_MAX) }, (_, k) => {
          const c = coin();
          // Tas un peu désordonné, toujours le même pour une même hauteur.
          c.style.setProperty('--x', `${((k * 37) % 21) - 10}px`);
          c.style.setProperty('--y', `${-k * 5}px`);
          return c;
        }),
      );
    }
    potCount.replaceChildren(
      el('span', { text: n > 0 ? `${n} 🪙` : 'Tas vide' }),
      ...(view && view.ante > 0 ? [el('small', { text: `mise ${view.ante}` })] : []),
    );
    pot.classList.toggle('empty', n === 0);
  };

  const renderDuelPanel = () => {
    const mine = me();
    const open = view?.phase === 'duel' && !!mine && !mine.out && !!view.category && !spinning;
    screen.classList.toggle('with-duel', open);
    if (!open || !view?.category) {
      duelPanel.hidden = true;
      panelRound = 0;
      return;
    }
    if (panelRound === view.round) return;
    panelRound = view.round;
    const letter = view.letter;
    const c = view.category;
    // Le champ commence par la lettre : on tape la suite du mot directement.
    const input = el('input', {
      type: 'text',
      maxlength: String(CARD_GAME.answer.maxLength),
      placeholder: `Un mot en ${letter}…`,
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'go',
    });
    input.value = letter;
    const send = el('button', { class: 'primary send', text: 'GO !' });
    const feedback = el('div', { class: 'feedback' });
    const submit = () => {
      const text = input.value.trim();
      if (text.length <= letter.length) return;
      link.answer(null, text);
      // Après une erreur, on garde la lettre et on resélectionne la suite pour retaper vite.
      input.setSelectionRange(letter.length, input.value.length);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    duelPanel.replaceChildren(
      el('div', { class: 'duel-title' }, [
        el('div', {}, [el('div', { class: 'duel-word', text: `Rafle ${plural(view.pot, 'pièce')} !` }), el('div', { class: 'duel-vs', text: 'Le premier qui trouve gagne tout le tas' })]),
        el('span', { class: 'duel-letter', text: letter }),
      ]),
      duelTimer(),
      el('div', { class: 'duel-ask', text: `Un mot en ${letter}, dans la catégorie :` }),
      el('div', { class: 'choices' }, [tintCategory(el('div', { class: 'choice' }, [el('span', { class: 'medal', text: CATEGORIES[c].icon }), el('span', { text: CATEGORIES[c].label })]), c)]),
      el('div', { class: 'answer-row' }, [input, send]),
      feedback,
    );
    duelPanel.hidden = false;
    // Le tapis s'arrête au-dessus du panneau, quelle que soit sa hauteur.
    screen.style.setProperty('--panel-h', `${duelPanel.offsetHeight}px`);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  /** Barre de temps : elle se vide jusqu'à la fin de la manche. */
  const duelTimer = () => {
    const bar = el('i');
    const left = Math.max(0, deadline - Date.now());
    bar.style.width = `${Math.min(100, (left / CARD_GAME.timing.duelMs) * 100)}%`;
    requestAnimationFrame(() => {
      bar.style.transition = `width ${left}ms linear`;
      bar.style.width = '0%';
    });
    return el('div', { class: 'duel-timer' }, [bar]);
  };

  /** Gros tampon au milieu de l'écran (« MATCH ! », « RAFLÉ ! »). */
  const stamp = (text: string, kind: 'duel' | 'win' | 'lose') => {
    const node = el('div', { class: `stamp ${kind}`, text });
    screen.append(node);
    later(STAMP_MS, () => node.remove());
  };

  const renderOverlay = () => {
    if (!view) return;
    if (view.phase === 'waiting' && link.mode === 'online') {
      overlay.hidden = false;
      const left = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
      overlay.replaceChildren(
        el('div', { class: 'panel' }, [
          el('h2', { class: 'title', text: link.tableCode ? 'Table entre amis' : 'Table en ligne' }),
          ...(link.tableCode ? [inviteBlock(link.tableCode)] : []),
          el('p', {
            text:
              view.players.length < CARD_GAME.players.min
                ? link.tableCode
                  ? 'Envoie le code (ou le lien) à tes amis. La partie démarre dès que vous êtes 2.'
                  : 'En attente d’autres joueurs…'
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
          el('p', { class: 'subtitle', text: myRank === 1 ? 'Tu as ruiné tout le monde 🏆' : `Tu finis ${myRank ?? '?'}${myRank === 1 ? 'er' : 'e'}. Revanche ?` }),
          el(
            'ol',
            { class: 'ranking' },
            view.ranking.map((r) =>
              el('li', { class: `${r.id === link.myId ? 'me' : ''} rank-${r.rank}` }, [
                el('span', { class: 'medal-rank', text: medals[r.rank - 1] ?? `${r.rank}` }),
                el('span', { class: 'who-rank', text: nameOf(r.id) }),
                el('span', { text: r.coins > 0 ? `${r.coins} 🪙` : 'ruiné 💀' }),
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

  /** Code de la table privée, en gros, et bouton pour inviter (partage ou copie du lien). */
  const inviteBlock = (code: string) => {
    if (invite?.dataset.code === code) return invite;
    const share = el('button', { class: 'primary', text: '📨 Inviter des amis' });
    // Lien vers le jeu web (dans l'appli : l'adresse publique, si elle est configurée).
    const base = import.meta.env.VITE_PUBLIC_URL ?? (isNative() ? '' : `${location.origin}${location.pathname}`);
    const url = base ? `${base}?table=${code}` : '';
    share.addEventListener('click', async () => {
      const text = url ? `Viens jouer à Bac Bataille avec moi ! Table ${code} : ${url}` : `Viens jouer à Bac Bataille avec moi ! Code de la table : ${code}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Bac Bataille', text, ...(url ? { url } : {}) });
        else {
          await navigator.clipboard.writeText(text);
          showToast(screen, 'Lien copié ! Colle-le à tes amis.', 'win');
        }
      } catch {
        /* partage annulé */
      }
    });
    invite = el('div', { class: 'invite' }, [el('div', { class: 'muted', text: 'Code de la table' }), el('div', { class: 'table-code', text: code }), share]);
    invite.dataset.code = code;
    return invite;
  };
  let invite: HTMLElement | null = null;

  const tickTimer = () => {
    const left = Math.max(0, deadline - Date.now());
    const duel = view?.phase === 'duel';
    timer.textContent = view && (duel || view.phase === 'waiting') && deadline > 0 ? `⏱️ ${Math.ceil(left / 1000)}` : '';
    timer.classList.toggle('urgent', duel && left < URGENT_MS);
    const second = Math.ceil(left / 1000);
    if (duel && left < URGENT_MS && left > 0 && second !== lastTick && !me()?.out) play('tick');
    lastTick = second;
    if (view && (view.phase === 'waiting' || view.phase === 'finished')) renderOverlay();
  };
  let lastTick = 0;
  timers.push(window.setInterval(tickTimer, 250));

  const avatarOf = (p: PlayerView) => {
    const a = el('div', { class: 'avatar', text: p.bot ? '🤖' : p.name.slice(0, 1).toUpperCase() });
    a.style.background = colorOf(p.id);
    return a;
  };

  /** Taille des rouleaux : la plus grande qui fasse tenir toutes les places autour du tapis. */
  const fitReels = () => {
    if (tapis.hidden) return;
    const css = getComputedStyle(tapis);
    const W = tapis.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const H = tapis.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const top = sides.top.childElementCount;
    const besides = sides.left.childElementCount + sides.right.childElementCount > 0;
    // Panneau de réponse ouvert : le tas se cache (le panneau dit ce qu'il y a à rafler).
    const potShown = !screen.classList.contains('with-duel');
    const rows = (top > 0 ? 1 : 0) + (besides ? 1 : 0) + 1;
    const potRow = !besides && potShown ? POT_H + REEL_GAP : 0;
    const byH = ((H - potRow - (rows - 1) * REEL_GAP) / rows - REEL_FRAME - REEL_LABEL_H) / TILE_RATIO;
    const byTop = top > 0 ? (W - (top - 1) * REEL_GAP) / top - REEL_FRAME - TAG_OVERFLOW : Infinity;
    const bySides = besides ? (W - 2 * REEL_GAP - (potShown ? POT_W : 0)) / 2 - REEL_FRAME - TAG_OVERFLOW : Infinity;
    const w = Math.floor(Math.max(TILE_MIN_W, Math.min(TILE_MAX_W, byH, byTop, bySides)));
    tapis.style.setProperty('--tile-w', `${w}px`);
    tapis.classList.toggle('tiny', w < TILE_TINY_W);
  };
  new ResizeObserver(() => fitReels()).observe(tapis);

  // ---------- Cinématiques ----------

  /**
   * Les rouleaux de chacun font défiler des catégories au hasard, s'arrêtent
   * l'un après l'autre… tous sur la même : MATCH ! La lettre tourne dans son
   * badge et s'arrête en même temps.
   */
  const spinReels = (category: CategoryId, letter: string) => {
    spinning = true;
    // Ordre d'arrêt : en face d'abord, soi en dernier (suspense).
    const tiles = liveTiles().sort((a, b) => Number(a.classList.contains('mine')) - Number(b.classList.contains('mine')));
    const n = Math.max(1, tiles.length);
    const lastStop = CARD_GAME.timing.spinMs - REEL_DONE_BEFORE_MS;
    const step = n > 1 ? Math.min(REEL_STOP_STEP_MS, (lastStop - REEL_FIRST_STOP_MS) / (n - 1)) : 0;
    const others = CATEGORY_IDS.filter((c) => c !== category);
    const loops = tiles.map((tile, k) => {
      tile.classList.remove('matched');
      let i = Math.floor(Math.random() * others.length);
      const loop = window.setInterval(() => {
        i = (i + 1 + k) % others.length;
        setReel(tile, others[i]!, 'blur');
      }, REEL_STEP_MS);
      timers.push(loop);
      later(REEL_FIRST_STOP_MS + k * step, () => {
        window.clearInterval(loop);
        setReel(tile, category, 'landed');
        play('flip');
      });
      return loop;
    });
    // La lettre roule dans son badge.
    letterBadge.classList.add('rolling');
    letterBadge.classList.remove('dim');
    const pool = CARD_GAME.letters;
    const roll = window.setInterval(() => {
      letterEl.textContent = pool[Math.floor(Math.random() * pool.length)]!;
    }, REEL_STEP_MS * 1.5);
    timers.push(roll);
    const matchAt = REEL_FIRST_STOP_MS + (n - 1) * step + 120;
    later(matchAt, () => {
      for (const l of loops) window.clearInterval(l);
      window.clearInterval(roll);
      letterBadge.classList.remove('rolling');
      letterEl.textContent = letter;
      letterBadge.classList.remove('pop');
      void letterBadge.offsetWidth;
      letterBadge.classList.add('pop');
      for (const t of tiles) t.classList.add('matched');
      spinning = false;
      status.textContent = `${CATEGORIES[category].icon} ${CATEGORIES[category].label} en ${letter} !`;
      if (!me()?.out) {
        stamp('MATCH !', 'duel');
        play('duel');
        haptic('duel');
      }
      render();
    });
  };

  /** Fait voler `count` pièces de `from` vers `to`, l'une après l'autre. */
  const flyCoins = (from: Element | null, to: Element | null, count: number, delayMs = 0) => {
    if (!from || !to || count <= 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    for (let k = 0; k < Math.min(count, COIN_FLY_MAX); k++) {
      const ghost = coin('flying');
      ghost.style.left = `${a.left + a.width / 2}px`;
      ghost.style.top = `${a.top + a.height / 2}px`;
      document.body.append(ghost);
      later(delayMs + k * COIN_STEP_MS + 20, () => {
        ghost.style.transform = `translate(calc(-50% + ${b.left + b.width / 2 - a.left - a.width / 2}px), calc(-50% + ${b.top + b.height / 2 - a.top - a.height / 2}px)) rotate(${(k % 2 ? 1 : -1) * 200}deg)`;
      });
      later(delayMs + k * COIN_STEP_MS + COIN_FLY_MS + 60, () => ghost.remove());
    }
  };

  /**
   * Bruit des pièces récupérées : un tintement à l'arrivée de chaque pièce dans
   * la bourse (un peu plus aigu à chaque fois), puis « ka-ching ! ».
   */
  const coinsIntoPurse = (pot: number) => {
    const n = Math.max(COIN_CLINKS_MIN, Math.min(pot, COIN_FLY_MAX));
    for (let k = 0; k < n; k++) later(COIN_FLY_MS - COIN_CLINK_EARLY_MS + k * COIN_STEP_MS, () => play('clink', 0.92 + k * 0.04 + Math.random() * 0.06));
    later(COIN_FLY_MS + n * COIN_STEP_MS, () => play('cash'));
  };

  const purseOf = (id: string) => screen.querySelector(`[data-player="${id}"] .purse`);

  // ---------- Partie ----------

  link.onView((v) => {
    view = v;
    deadline = v.endsInMs > 0 ? Date.now() + v.endsInMs : 0;
    render();
    tickTimer();
  });

  link.onEvent((e: GameEvent) => {
    switch (e.kind) {
      case 'ante': {
        badges = new Map();
        const raised = view && view.round > 0 && e.ante > view.ante;
        status.textContent = `Chacun pose ${plural(e.ante, 'pièce')} au milieu…`;
        if (raised) {
          stamp(`MISE ×${e.ante}`, 'lose');
          showToast(screen, `💰 La mise monte : ${plural(e.ante, 'pièce')} par manche !`, 'info', 2200);
        }
        for (const [id, n] of Object.entries(e.paid)) flyCoins(purseOf(id), potCoins, n);
        if (Object.values(e.paid).some((n) => n > 0)) play('coin');
        for (const t of liveTiles()) {
          t.classList.remove('matched');
          setReel(t, null);
        }
        break;
      }
      case 'spin':
        status.textContent = 'Les catégories tournent…';
        spinReels(e.category, e.letter);
        break;
      case 'duel':
        status.textContent = me()?.out ? '👀 Tu es éliminé : regarde qui sera le plus rapide !' : view?.category ? `${CATEGORIES[view.category].icon} ${CATEGORIES[view.category].label} en ${view.letter} : vite, un mot !` : 'Vite, un mot !';
        break;
      case 'won': {
        flyCoins(potCoins, purseOf(e.winnerId), e.pot);
        const winner = nameOf(e.winnerId);
        status.textContent = `🏆 ${winner} rafle ${plural(e.pot, 'pièce')} avec « ${e.word} » !`;
        badges.set(e.winnerId, `+${e.pot}`);
        if (e.winnerId === link.myId) {
          stamp('RAFLÉ !', 'win');
          showToast(screen, `« ${e.word} » ✅ Tu rafles ${plural(e.pot, 'pièce')} !`, 'win', 2800);
          play('right');
          coinsIntoPurse(e.pot);
          haptic('right');
          const r = purseOf(link.myId)?.getBoundingClientRect();
          confetti(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
        } else if (!me()?.out) {
          showToast(screen, `😩 ${winner} a été plus rapide avec « ${e.word} ».`, 'error', 2800);
          play('lose');
        }
        break;
      }
      case 'timeout':
        status.textContent = `⏱️ Personne n’a trouvé : les ${plural(e.pot, 'pièce')} restent au milieu. Cagnotte !`;
        stamp('CAGNOTTE !', 'lose');
        break;
      case 'eliminated': {
        const mine = e.ids.includes(link.myId);
        const others = e.ids.filter((id) => id !== link.myId).map(nameOf);
        if (mine) {
          showToast(screen, '💀 Plus de pièce : tu es éliminé ! Regarde la fin de la partie.', 'error', 3500);
          play('lose');
        } else if (others.length > 0) showToast(screen, `💀 ${others.join(', ')} ${others.length > 1 ? 'sont éliminés' : 'est éliminé'} : plus de pièce !`, 'info', 2500);
        break;
      }
      case 'finished':
        if (e.ranking[0]?.id === link.myId) {
          play('fanfare');
          confetti();
          later(600, () => confetti());
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

  link.onNotice((n) => {
    const feedback = duelPanel.querySelector('.feedback');
    if (feedback && !duelPanel.hidden && n.level === 'error') {
      feedback.textContent = `❌ ${n.text}`;
      haptic('wrong');
      play('wrong');
      duelPanel.classList.remove('shake');
      void duelPanel.offsetWidth;
      duelPanel.classList.add('shake');
    } else showToast(screen, n.text, n.level);
  });

  link.onConnection((state) => {
    if (state === 'reconnecting') showToast(screen, '📶 Connexion perdue… reconnexion', 'error', 60_000);
    else {
      screen.querySelector('.toast')?.remove();
      showToast(screen, '✅ Reconnecté !', 'win');
    }
  });

  link.onDisconnected(() => {
    showToast(screen, 'Déconnecté du serveur.', 'error', 4000);
    later(2000, () => quit.click());
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
