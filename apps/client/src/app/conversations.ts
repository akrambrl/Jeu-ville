/**
 * Parler aux gens : toucher un passant ou un marchand ouvre la boîte de
 * dialogue (on s'approche d'abord s'il est trop loin) ; un habitant marqué
 * « ❗ » demande de l'aide (mission du quotidien) ; toucher un vrai joueur
 * propose de lui écrire dans le chat.
 */
import {
  DIALOGUE,
  ERRANDS,
  ERRAND_LINES,
  ERRAND_TYPES,
  botDialogue,
  botName,
  isNightHour,
  type DialogueContext,
  type DistrictMap,
  type ErrandOffer,
  type ErrandView,
  type TilePoint,
} from '@jeu-ville/shared';
import { rewardText } from '../ui/errands.js';
import type { DistrictLink } from '../net/link.js';
import type { DialogueBox } from '../ui/dialogue.js';
import type { CityView, PersonTap } from '../world/CityView.js';

/** Ce que la conversation doit savoir des missions du quotidien. */
export interface ErrandState {
  offers(): ErrandOffer[];
  active(): ErrandView | null;
  doneToday(): string[];
  accept(offerId: string): void;
}

const VENDOR_NAMES: Record<string, string> = { corn: 'Marchand de maïs', chestnut: 'Marchand de marrons' };

export class Conversations {
  private readonly visits = new Map<string, number>();
  private readonly busyTiles: Set<string>;
  /** On marche vers quelqu'un pour lui parler. */
  private pending: PersonTap | null = null;

  constructor(
    map: DistrictMap,
    private readonly link: DistrictLink,
    private readonly view: CityView,
    private readonly dialogue: DialogueBox,
    /** Vrai joueur touché : lui écrire dans le chat. */
    private readonly mention: (name: string) => void,
    private readonly errands: ErrandState,
  ) {
    this.busyTiles = new Set(map.busyStreets.flatMap((s) => s.sidewalks.map((t) => `${t.x},${t.y}`)));
  }

  tap(person: PersonTap, me: TilePoint): void {
    if (this.dialogue.isOpen) return;
    if (person.kind === 'avatar' && person.view.name) {
      this.mention(person.view.name);
      return;
    }
    const at = this.where(person);
    if (!at) return;
    if (Math.hypot(at.x - me.x, at.y - me.y) <= DIALOGUE.talkRange) {
      this.talk(person);
      return;
    }
    // Trop loin : on s'approche, la conversation commence en arrivant.
    this.pending = person;
    this.view.requestMove({ x: Math.round(at.x), y: Math.round(at.y) });
  }

  /** À chaque image : arrivé assez près de la personne visée ? */
  update(me: TilePoint): void {
    if (!this.pending) return;
    const at = this.where(this.pending);
    if (!at) {
      this.pending = null;
      return;
    }
    if (Math.hypot(at.x - me.x, at.y - me.y) <= DIALOGUE.talkRange - 1) {
      const person = this.pending;
      this.pending = null;
      this.talk(person);
    }
  }

  /** On a demandé à aller ailleurs : on oublie la conversation prévue. */
  cancel(): void {
    this.pending = null;
  }

  private where(person: PersonTap): TilePoint | null {
    return person.kind === 'vendor' ? person.vendor : this.view.avatarTile(person.id);
  }

  private talk(person: PersonTap): void {
    if (person.kind === 'vendor') {
      const v = person.vendor;
      const visit = this.visits.get(v.id) ?? 0;
      this.visits.set(v.id, visit + 1);
      this.dialogue.open(VENDOR_NAMES[v.kind] ?? 'Marchand', botDialogue(v.id, v.kind, visit));
      return;
    }
    const { id, view } = person;
    const offer = this.errands.offers().find((o) => `giver-${o.id}` === id);
    if (offer) return this.talkGiver(offer);
    const visit = this.visits.get(id) ?? 0;
    this.visits.set(id, visit + 1);
    this.link.talk(id);
    const lines = botDialogue(id, this.context(id, view.pet), visit);
    this.view.showBubble(id, '💬');
    this.dialogue.open(botName(id, view.sex), lines);
  }

  /** Habitant qui demande de l'aide : explication, puis « Aider » ou « Plus tard ». */
  private talkGiver(offer: ErrandOffer): void {
    const cfg = ERRAND_TYPES[offer.type];
    const name = offer.giver.name;
    const active = this.errands.active();
    const done = this.errands.doneToday();
    if (done.includes(offer.id)) return this.dialogue.open(name, [...ERRAND_LINES.alreadyHelped]);
    if (active?.kind === 'active') {
      return this.dialogue.open(name, active.offerId === offer.id ? [active.text] : [...ERRAND_LINES.busy]);
    }
    if (done.length >= ERRANDS.perDay) return this.dialogue.open(name, [...ERRAND_LINES.dailyLimit]);
    this.dialogue.open(name, [...cfg.ask, `(Récompense : ${rewardText(offer.type)})`], undefined, [
      { label: '✅ Aider', primary: true, act: () => this.errands.accept(offer.id) },
      { label: 'Plus tard', act: () => this.dialogue.open(name, [...ERRAND_LINES.declined]) },
    ]);
  }

  private context(id: string, pet: string): DialogueContext {
    if (pet.startsWith('dog')) return 'dog';
    const at = this.view.avatarTile(id);
    if (at && this.busyTiles.has(`${Math.round(at.x)},${Math.round(at.y)}`)) return 'boulevard';
    if (isNightHour(new Date().getHours())) return 'night';
    return 'street';
  }
}
