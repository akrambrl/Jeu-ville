/**
 * Amis : bouton 👥 (avec le nombre de demandes reçues) et feuille avec les
 * demandes reçues, la liste des amis (🟢 en ligne / ⚪ hors ligne, et où ils
 * jouent), l'ajout par pseudo et les demandes envoyées.
 */
import { getDistrictMap, type FriendsView } from '@jeu-ville/shared';
import type { ChatLink } from '../net/chat.js';
import { el } from './dom.js';

export class FriendsSheet {
  readonly root: HTMLElement;
  readonly toggle: HTMLButtonElement;
  private readonly body = el('div', { class: 'agency-body' });
  private readonly badge = el('span', { class: 'chat-badge' });
  private view: FriendsView = { friends: [], incoming: [], outgoing: [] };

  constructor(
    private readonly link: ChatLink,
    /** Écrire à un ami dans le chat (« @pseudo »). */
    private readonly mention: (name: string) => void,
  ) {
    const close = el('button', { class: 'sheet-close', text: 'Fermer' });
    close.addEventListener('click', () => this.close());
    const sheet = el('div', { class: 'sheet agency' }, [el('h2', { text: '👥 Mes amis' }), this.body, close]);
    this.root = el('div', { class: 'sheet-backdrop' }, [sheet]);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.hidden = true;
    this.toggle = el('button', { class: 'friends-toggle', 'aria-label': 'Mes amis' }, [el('span', { text: '👥' }), this.badge]);
    this.toggle.addEventListener('click', () => this.open());
    this.renderBadge();
  }

  /** Les identifiants de mes amis (pour proposer « ajouter » seulement aux autres). */
  isFriend(characterId: string): boolean {
    return this.view.friends.some((f) => f.characterId === characterId);
  }

  isPending(characterId: string): boolean {
    return [...this.view.incoming, ...this.view.outgoing].some((f) => f.characterId === characterId);
  }

  update(view: FriendsView): void {
    this.view = view;
    this.renderBadge();
    if (!this.root.hidden) this.render();
  }

  open(): void {
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private renderBadge(): void {
    const n = this.view.incoming.length;
    this.badge.textContent = n > 0 ? String(n) : '';
    this.badge.hidden = n === 0;
    const online = this.view.friends.filter((f) => f.online).length;
    this.toggle.title = online > 0 ? `${online} ami${online > 1 ? 's' : ''} en ligne` : 'Mes amis';
  }

  private render(): void {
    this.body.replaceChildren();
    if (!this.link.realPlayers) {
      this.body.append(el('p', { class: 'agency-hint', text: 'Les amis, c’est avec de vrais joueurs : disponible dans le jeu en ligne. Dans la démo, il n’y a que des bots 🤖.' }));
    }

    // Ajouter par pseudo.
    const input = el('input', { class: 'agency-input', placeholder: 'Pseudo de ton ami', maxlength: '40', autocomplete: 'off' }) as HTMLInputElement;
    const add = el('button', { class: 'primary small', type: 'submit', text: '👋 Ajouter' });
    const form = el('form', { class: 'friends-add' }, [input, add]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      this.link.requestFriend({ name });
      input.value = '';
    });
    this.body.append(form);

    if (this.view.incoming.length > 0) {
      this.body.append(el('h3', { class: 'jobs-type', text: `📩 Demandes reçues (${this.view.incoming.length})` }));
      for (const r of this.view.incoming) {
        const yes = el('button', { class: 'primary small', text: 'Accepter' });
        yes.addEventListener('click', () => this.link.respondFriend(r.characterId, true));
        const no = el('button', { class: 'small', text: 'Refuser' });
        no.addEventListener('click', () => this.link.respondFriend(r.characterId, false));
        this.body.append(this.card('👋', r.name, 'veut être ton ami', [yes, no]));
      }
    }

    const online = this.view.friends.filter((f) => f.online).length;
    this.body.append(el('h3', { class: 'jobs-type', text: `🤝 Amis (${online} en ligne sur ${this.view.friends.length})` }));
    if (this.view.friends.length === 0) {
      this.body.append(el('p', { class: 'agency-empty', text: 'Pas encore d’amis. Ajoute quelqu’un par son pseudo, ou touche un joueur dans la ville ou dans le chat.' }));
    }
    for (const f of this.view.friends) {
      const map = getDistrictMap(f.districtId);
      const where = map ? `${map.cityName} · ${map.districtName}` : '';
      const write = el('button', { class: 'small', text: '💬' , title: 'Lui écrire dans le chat' });
      write.addEventListener('click', () => {
        this.close();
        this.mention(f.name);
      });
      const remove = this.twoTap('Retirer', () => this.link.removeFriend(f.characterId));
      this.body.append(this.card(f.online ? '🟢' : '⚪', f.name, f.online ? `En ligne · ${where}` : 'Hors ligne', [write, remove]));
    }

    if (this.view.outgoing.length > 0) {
      this.body.append(el('h3', { class: 'jobs-type', text: '⏳ Demandes envoyées' }));
      for (const r of this.view.outgoing) {
        const cancel = el('button', { class: 'small', text: 'Annuler' });
        cancel.addEventListener('click', () => this.link.removeFriend(r.characterId));
        this.body.append(this.card('⏳', r.name, 'en attente de réponse', [cancel]));
      }
    }
  }

  private card(icon: string, name: string, detail: string, actions: HTMLElement[]): HTMLElement {
    return el('div', { class: 'agency-card' }, [
      el('div', { class: 'agency-card-icon', text: icon }),
      el('div', { class: 'agency-card-text' }, [el('strong', { text: name }), el('small', { text: detail })]),
      el('div', { class: 'agency-card-actions' }, actions),
    ]);
  }

  private twoTap(label: string, act: () => void): HTMLButtonElement {
    const b = el('button', { class: 'small', text: label });
    let armed = false;
    b.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        b.textContent = 'Sûr ?';
        window.setTimeout(() => {
          armed = false;
          b.textContent = label;
        }, 4000);
        return;
      }
      act();
    });
    return b;
  }
}
