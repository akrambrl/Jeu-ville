/**
 * Boîte de dialogue « à la Pokémon » : nom de qui parle, texte qui s'écrit
 * lettre par lettre, ▼ pour passer à la suite. Un appui finit la phrase en
 * cours, le suivant passe à la réplique suivante, le dernier ferme.
 */
import { DIALOGUE } from '@jeu-ville/shared';
import { el } from './dom.js';

export interface DialogueChoice {
  label: string;
  primary?: boolean;
  act: () => void;
}

export class DialogueBox {
  readonly root: HTMLElement;
  private readonly nameEl = el('div', { class: 'dialogue-name' });
  private readonly textEl = el('div', { class: 'dialogue-text' });
  private readonly nextEl = el('div', { class: 'dialogue-next', text: '▼' });
  private readonly choicesEl = el('div', { class: 'dialogue-choices' });
  private choices: DialogueChoice[] = [];
  private lines: string[] = [];
  private index = 0;
  private shown = 0;
  private timer = 0;
  private onClose: (() => void) | null = null;

  constructor() {
    this.root = el('div', { class: 'dialogue', role: 'dialog', 'aria-live': 'polite' }, [this.nameEl, this.textEl, this.choicesEl, this.nextEl]);
    this.root.hidden = true;
    this.root.addEventListener('click', () => this.advance());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /**
   * Affiche une conversation ; `onClose` est appelé à la fin. Avec `choices`,
   * la dernière réplique propose des boutons (le choix ferme la boîte).
   */
  open(name: string, lines: string[], onClose?: () => void, choices: DialogueChoice[] = []): void {
    this.lines = lines;
    this.choices = choices;
    this.choicesEl.replaceChildren();
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
    const last = this.index >= this.lines.length - 1;
    this.nextEl.hidden = last && this.choices.length > 0;
    this.nextEl.textContent = last ? '✕' : '▼';
    if (last && this.choices.length > 0 && this.choicesEl.childElementCount === 0) {
      for (const c of this.choices) {
        const b = el('button', { class: c.primary ? 'primary small' : 'small', text: c.label });
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close();
          c.act();
        });
        this.choicesEl.append(b);
      }
    }
  }

  private advance(): void {
    const line = this.lines[this.index] ?? '';
    if (this.shown < line.length) return this.finishLine();
    // Dernière réplique avec choix : il faut choisir.
    if (this.index >= this.lines.length - 1 && this.choices.length > 0) return;
    this.index++;
    if (this.index >= this.lines.length) return this.close();
    this.type();
  }
}
