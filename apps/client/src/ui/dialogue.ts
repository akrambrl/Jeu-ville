/**
 * Boîte de dialogue « à la Pokémon » : nom de qui parle, texte qui s'écrit
 * lettre par lettre, ▼ pour passer à la suite. Un appui finit la phrase en
 * cours, le suivant passe à la réplique suivante, le dernier ferme.
 */
import { DIALOGUE } from '@jeu-ville/shared';
import { el } from './dom.js';

export class DialogueBox {
  readonly root: HTMLElement;
  private readonly nameEl = el('div', { class: 'dialogue-name' });
  private readonly textEl = el('div', { class: 'dialogue-text' });
  private readonly nextEl = el('div', { class: 'dialogue-next', text: '▼' });
  private lines: string[] = [];
  private index = 0;
  private shown = 0;
  private timer = 0;
  private onClose: (() => void) | null = null;

  constructor() {
    this.root = el('div', { class: 'dialogue', role: 'dialog', 'aria-live': 'polite' }, [this.nameEl, this.textEl, this.nextEl]);
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.advance());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Affiche une conversation ; `onClose` est appelé à la fin. */
  open(name: string, lines: string[], onClose?: () => void): void {
    this.lines = lines;
    this.index = 0;
    this.nameEl.textContent = name;
    this.onClose = onClose ?? null;
    this.root.hidden = false;
    this.type();
  }

  close(): void {
    window.clearInterval(this.timer);
    this.root.hidden = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private type(): void {
    window.clearInterval(this.timer);
    const line = this.lines[this.index] ?? '';
    this.shown = 0;
    this.textEl.textContent = '';
    this.nextEl.hidden = true;
    this.timer = window.setInterval(() => {
      this.shown++;
      this.textEl.textContent = line.slice(0, this.shown);
      if (this.shown >= line.length) this.finishLine();
    }, 1000 / DIALOGUE.typeCharsPerSecond);
  }

  private finishLine(): void {
    window.clearInterval(this.timer);
    const line = this.lines[this.index] ?? '';
    this.shown = line.length;
    this.textEl.textContent = line;
    this.nextEl.hidden = false;
    this.nextEl.textContent = this.index < this.lines.length - 1 ? '▼' : '✕';
  }

  private advance(): void {
    const line = this.lines[this.index] ?? '';
    if (this.shown < line.length) return this.finishLine();
    this.index++;
    if (this.index >= this.lines.length) return this.close();
    this.type();
  }
}
