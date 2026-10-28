/**
 * Chat général, à droite de l'écran (style Habbo) : fixe sur grand écran,
 * repliable sur téléphone (bouton 💬 avec le nombre de messages non lus).
 * Toucher le message d'un autre joueur : le signaler ou le bloquer.
 */
import { CHAT, type ChatLine, type Notice } from '@jeu-ville/shared';
import type { ChatLink } from '../net/chat.js';
import { el } from './dom.js';

/** Au-delà de cette largeur d'écran (px), le chat reste ouvert à droite. */
const DOCK_MIN_WIDTH = 900;
const MAX_LINES_SHOWN = 120;

export interface ChatPanelOptions {
  /** Un message arrive : bulle au-dessus de la tête de l'auteur s'il est dans le quartier. */
  onLine: (line: ChatLine) => void;
  notify: (notice: Notice) => void;
}

export class ChatPanel {
  readonly root: HTMLElement;
  readonly toggle: HTMLButtonElement;
  private readonly list = el('div', { class: 'chat-lines', role: 'log', 'aria-live': 'polite' });
  private readonly input = el('input', {
    class: 'chat-input',
    placeholder: 'Écris un message…',
    maxlength: String(CHAT.maxLength),
    enterkeyhint: 'send',
    autocomplete: 'off',
  }) as HTMLInputElement;
  private readonly blockedBar = el('div', { class: 'chat-blocked' });
  private readonly badge = el('span', { class: 'chat-badge' });
  private blocked = new Set<string>();
  /** Noms vus dans le chat (pour la liste des joueurs bloqués). */
  private readonly names = new Map<string, string>();
  private readonly lines: ChatLine[] = [];
  private unread = 0;
  private open = false;

  constructor(
    private readonly link: ChatLink,
    private readonly opts: ChatPanelOptions,
  ) {
    const close = el('button', { class: 'chat-close', text: '✕', 'aria-label': 'Fermer le chat' });
    close.addEventListener('click', () => this.setOpen(false));
    const send = el('button', { class: 'primary chat-send', type: 'submit', text: 'Envoyer' });
    const form = el('form', { class: 'chat-form' }, [this.input, send]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.link.say(text);
      this.input.value = '';
    });
    const subtitle = link.realPlayers ? 'Tous les joueurs connectés' : 'Démo : seulement des bots 🤖';
    this.root = el('aside', { class: 'chat' }, [
      el('div', { class: 'chat-head' }, [el('div', {}, [el('strong', { text: '💬 Chat général' }), el('small', { text: subtitle })]), close]),
      this.blockedBar,
      this.list,
      form,
    ]);
    this.toggle = el('button', { class: 'chat-toggle', 'aria-label': 'Ouvrir le chat' }, [el('span', { text: '💬' }), this.badge]);
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));

    const docked = window.matchMedia(`(min-width: ${DOCK_MIN_WIDTH}px)`);
    const applyDock = () => {
      document.body.classList.toggle('chat-docked', docked.matches);
      this.setOpen(docked.matches);
      // La vue 3D se recadre sur la place qui lui reste.
      window.dispatchEvent(new Event('resize'));
    };
    docked.addEventListener('change', applyDock);
    applyDock();
    this.renderBadge();

    link.subscribe({
      history: (lines) => lines.forEach((l) => this.add(l, false)),
      line: (l) => {
        this.add(l, true);
        if (!this.blocked.has(l.characterId)) opts.onLine(l);
      },
      blocked: (ids) => {
        this.blocked = new Set(ids);
        this.renderAll();
      },
      notice: opts.notify,
    });
  }

  /** Ouvre le chat avec un début de message (ex. « @Akram »). */
  mention(name: string): void {
    this.setOpen(true);
    this.input.value = `@${name} `;
    this.input.focus();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle('open', open);
    if (open) {
      this.unread = 0;
      this.renderBadge();
      this.scrollDown();
    }
  }

  private add(line: ChatLine, live: boolean): void {
    this.names.set(line.characterId, line.name);
    this.lines.push(line);
    if (this.lines.length > MAX_LINES_SHOWN) this.lines.shift();
    if (this.blocked.has(line.characterId)) return;
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 40;
    this.list.append(this.lineEl(line));
    while (this.list.childElementCount > MAX_LINES_SHOWN) this.list.firstElementChild?.remove();
    if (atBottom || line.characterId === this.link.selfId) this.scrollDown();
    if (live && !this.open && line.characterId !== this.link.selfId) {
      this.unread++;
      this.renderBadge();
    }
  }

  private renderAll(): void {
    this.list.replaceChildren(...this.lines.filter((l) => !this.blocked.has(l.characterId)).map((l) => this.lineEl(l)));
    this.renderBlockedBar();
    this.scrollDown();
  }

  private lineEl(line: ChatLine): HTMLElement {
    const mine = line.characterId === this.link.selfId;
    const time = new Date(line.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const name = el('span', { class: 'chat-name', text: `${line.bot ? '🤖 ' : ''}${line.name}` });
    name.style.color = nameColor(line.name);
    const row = el('div', { class: `chat-line${mine ? ' mine' : ''}` }, [
      el('div', { class: 'chat-meta' }, [name, el('small', { text: time })]),
      el('div', { class: 'chat-text', text: line.text }),
    ]);
    if (!mine && !line.bot) {
      row.addEventListener('click', () => this.toggleActions(row, line));
      row.title = 'Toucher pour signaler ou bloquer';
    }
    return row;
  }

  private toggleActions(row: HTMLElement, line: ChatLine): void {
    const existing = row.querySelector('.chat-actions');
    this.list.querySelectorAll('.chat-actions').forEach((a) => a.remove());
    if (existing) return;
    const report = el('button', { class: 'small', text: '🚩 Signaler' });
    report.addEventListener('click', (e) => {
      e.stopPropagation();
      this.link.report(line.id);
      row.querySelector('.chat-actions')?.remove();
    });
    const block = el('button', { class: 'small', text: `🚫 Bloquer ${line.name}` });
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      this.link.block(line.characterId, true);
    });
    row.append(el('div', { class: 'chat-actions' }, [report, block]));
  }

  private renderBlockedBar(): void {
    this.blockedBar.replaceChildren();
    if (this.blocked.size === 0) return;
    const details = el('details', {}, [el('summary', { text: `🚫 ${this.blocked.size} joueur${this.blocked.size > 1 ? 's' : ''} bloqué${this.blocked.size > 1 ? 's' : ''}` })]);
    for (const id of this.blocked) {
      const unblock = el('button', { class: 'small', text: 'Débloquer' });
      unblock.addEventListener('click', () => this.link.block(id, false));
      details.append(el('div', { class: 'chat-blocked-row' }, [el('span', { text: this.names.get(id) ?? 'Joueur' }), unblock]));
    }
    this.blockedBar.append(details);
  }

  private renderBadge(): void {
    this.badge.textContent = this.unread > 0 ? String(Math.min(this.unread, 99)) : '';
    this.badge.hidden = this.unread === 0;
  }

  private scrollDown(): void {
    this.list.scrollTop = this.list.scrollHeight;
  }
}

/** Couleur stable par pseudo, lisible sur fond clair. */
function nameColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 60%, 38%)`;
}
