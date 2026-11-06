/**
 * La table de jeu : adversaires en haut, lettre tirée au centre, sa propre pile
 * en bas, et le panneau de duel quand sa carte a la même couleur qu'une autre.
 */
import { CARD_COLOR_LABELS, CARD_GAME, CATEGORIES, type CategoryId, type Duel, type GameEvent, type GameView, type PlayerView } from '@jeu-ville/shared';
import type { TableLink } from '../net/tableLink.js';
import { cardBack, cardFace, cardSlot } from './cardView.js';
import { el, showToast } from './dom.js';
import { showRules } from './rules.js';

/** Défilement des lettres pendant le tirage (ms entre deux lettres). */
const ROLL_STEP_MS = 70;
/** La lettre s'arrête un peu avant la fin du tirage. */
const ROLL_STOP_BEFORE_MS = 700;
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
  const letterBox = el('div', { class: 'letter-box' }, [el('span', { class: 'letter-label', text: 'Lettre' }), el('span', { class: 'letter' })]);
  const status = el('div', { class: 'status' });
  const mySeat = el('div', { class: 'my-seat' });
  const duelPanel = el('div', { class: 'duel-panel', hidden: '' });
  const overlay = el('div', { class: 'overlay table-overlay', hidden: '' });
  const screen = el('div', { class: 'table-screen' }, [
    el('div', { class: 'topbar' }, [quit, roundLabel, timer, help]),
    opponents,
    el('div', { class: 'center' }, [letterBox, status]),
    mySeat,
    duelPanel,
    overlay,
  ]);
  root.append(screen);

  const letterEl = letterBox.querySelector('.letter')!;
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

  const seat = (p: PlayerView, big: boolean): HTMLElement => {
    const duel = view?.duels.find((d) => d.playerIds.includes(p.id));
    const inDuel = !!duel && duel.winnerId === null;
    const node = el('div', { class: `seat${big ? ' mine' : ''}${inDuel ? ' in-duel' : ''}${p.left ? ' left' : ''}` });
    if (duel) node.style.setProperty('--duel', CARD_COLOR_LABELS[duel.color].hex);
    const avatar = el('div', { class: 'avatar', text: p.name.slice(0, 1).toUpperCase() });
    avatar.style.background = AVATAR_COLORS[hash(p.id) % AVATAR_COLORS.length]!;
    const badge = badges.get(p.id);
    const fresh = !!p.top && shownTop.get(p.id) !== p.top.id;
    shownTop.set(p.id, p.top?.id ?? 0);
    node.append(
      el('div', { class: 'who' }, [
        avatar,
        el('div', { class: 'name', text: `${p.bot ? '🤖 ' : ''}${p.id === link.myId ? `${p.name} (toi)` : p.name}` }),
      ]),
      el('div', { class: 'stack' }, [
        el('div', { class: 'deck' }, [p.deckCount > 0 ? cardBack(big ? 'big' : 'small') : cardSlot(big ? 'big' : 'small'), el('span', { class: 'count', text: String(p.deckCount) })]),
        el('div', { class: 'pile' }, [p.top ? cardFace(p.top, big ? 'big' : 'small', fresh) : cardSlot(big ? 'big' : 'small'), el('span', { class: 'count', text: String(p.pileCount) })]),
      ]),
    );
    if (inDuel) node.append(el('div', { class: 'duel-tag', text: '⚔️ Duel' }));
    if (badge) node.append(el('div', { class: 'badge', text: badge }));
    return node;
  };

  const render = () => {
    if (!view) return;
    roundLabel.textContent = view.round > 0 ? `Manche ${view.round}` : 'Table';
    opponents.replaceChildren(...view.players.filter((p) => p.id !== link.myId).map((p) => seat(p, false)));
    const mine = me();
    mySeat.replaceChildren(...(mine ? [seat(mine, true)] : []));
    if (!rolling) letterEl.textContent = view.letter || '?';
    letterBox.classList.toggle('dim', view.phase === 'waiting' || view.phase === 'finished');
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
    selectedCategory = top.categories[0];
    const rivals = duel.playerIds.filter((id) => id !== link.myId).map(nameOf).join(', ');
    const input = el('input', { type: 'text', maxlength: String(CARD_GAME.answer.maxLength), placeholder: `Un mot en ${view.letter}…`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const send = el('button', { class: 'primary', text: 'Valider' });
    const feedback = el('div', { class: 'feedback' });
    const choices = top.categories.map((c) => {
      const b = el('button', { class: `choice${c === selectedCategory ? ' selected' : ''}`, type: 'button' }, [el('span', { text: CATEGORIES[c].icon }), el('span', { text: CATEGORIES[c].label })]);
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
      el('div', { class: 'duel-title' }, [el('strong', { text: `⚔️ Duel contre ${rivals} !` }), el('span', { class: 'duel-letter', text: view.letter })]),
      el('div', { class: 'choices' }, choices),
      el('div', { class: 'answer-row' }, [input, send]),
      feedback,
    );
    duelPanel.style.setProperty('--duel', CARD_COLOR_LABELS[duel.color].hex);
    duelPanel.hidden = false;
    input.focus();
  };

  const renderOverlay = () => {
    if (!view) return;
    if (view.phase === 'waiting' && link.mode === 'online') {
      overlay.hidden = false;
      const left = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
      overlay.replaceChildren(
        el('div', { class: 'panel' }, [
          el('h2', { text: '🃏 Table en ligne' }),
          el('p', {
            text:
              view.players.length < CARD_GAME.players.min
                ? 'En attente d’autres joueurs… Invite tes amis : ils choisissent « Jouer en ligne ».'
                : `La partie commence dans ${left} s`,
          }),
          el('ul', { class: 'names' }, view.players.map((p) => el('li', { text: `${p.name}${p.id === link.myId ? ' (toi)' : ''}` }))),
          el('p', { class: 'muted', text: `${view.players.length}/${CARD_GAME.players.max} joueurs` }),
        ]),
      );
    } else if (view.phase === 'finished') {
      overlay.hidden = false;
      const medals = ['🥇', '🥈', '🥉'];
      const myRank = view.ranking.find((r) => r.id === link.myId)?.rank;
      const again = el('button', { class: 'primary', text: '🔁 Rejouer' });
      const menu = el('button', { text: 'Menu' });
      again.addEventListener('click', () => link.restart());
      menu.addEventListener('click', () => quit.click());
      const left = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
      overlay.replaceChildren(
        el('div', { class: 'panel' }, [
          el('h2', { text: myRank === 1 ? '🏆 Tu as gagné !' : 'Partie terminée' }),
          el(
            'ol',
            { class: 'ranking' },
            view.ranking.map((r) =>
              el('li', { class: r.id === link.myId ? 'me' : '' }, [
                el('span', { text: `${medals[r.rank - 1] ?? `${r.rank}.`} ${nameOf(r.id)}` }),
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
    timer.classList.toggle('urgent', duel && left < 4000);
    if (view && (view.phase === 'waiting' || view.phase === 'finished')) renderOverlay();
  };
  window.setInterval(tickTimer, 250);

  // ---------- Lettre tirée au sort ----------

  const rollLetter = (letter: string) => {
    window.clearInterval(rolling);
    const pool = CARD_GAME.letters;
    letterBox.classList.remove('pop');
    rolling = window.setInterval(() => (letterEl.textContent = pool[Math.floor(Math.random() * pool.length)]!), ROLL_STEP_MS);
    window.setTimeout(() => {
      window.clearInterval(rolling);
      rolling = 0;
      letterEl.textContent = letter;
      letterBox.classList.add('pop');
    }, CARD_GAME.timing.letterMs - ROLL_STOP_BEFORE_MS);
  };

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
        status.textContent = 'Tirage de la lettre…';
        rollLetter(e.letter);
        break;
      case 'reveal':
        status.textContent = 'Cartes retournées !';
        break;
      case 'noDuel':
        status.textContent = 'Pas de couleur en commun : on continue !';
        break;
      case 'duels': {
        const mine = e.duels.some((d) => d.playerIds.includes(link.myId));
        status.textContent = e.duels.map((d) => `⚔️ ${d.playerIds.map(nameOf).join(' vs ')}`).join('   ');
        if (mine) {
          showToast(screen, '⚔️ DUEL ! Vite, un mot !', 'win', 1500);
          navigator.vibrate?.(200);
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
      case 'waiting':
        badges = new Map();
        status.textContent = '';
        break;
    }
    render();
  });

  const onDuelWon = (d: Duel) => {
    const winner = nameOf(d.winnerId!);
    const cat = d.category ? CATEGORIES[d.category].label : '';
    const losers = d.losers.map((l) => `${nameOf(l.id)} récupère ${l.cards} carte${l.cards > 1 ? 's' : ''}`).join(', ');
    status.textContent = `🏆 ${winner} : « ${d.word} » (${cat}) · ${losers}`;
    badges.set(d.winnerId!, '🏆');
    for (const l of d.losers) badges.set(l.id, `+${l.cards}`);
    if (d.winnerId === link.myId) showToast(screen, `🏆 Bien joué ! « ${d.word} »`, 'win');
    else if (d.playerIds.includes(link.myId)) showToast(screen, `😩 ${winner} a été plus rapide : « ${d.word} »`, 'error');
  };

  link.onNotice((n) => {
    const feedback = duelPanel.querySelector('.feedback');
    if (feedback && !duelPanel.hidden && n.level === 'error') {
      feedback.textContent = `❌ ${n.text}`;
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
