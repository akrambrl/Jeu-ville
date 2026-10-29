/**
 * Tata Nadia, la cheffe de l'écran de cuisine : personnage original dessiné
 * en SVG (style mignon, gros yeux, toque), qui encourage et réagit à chaque
 * étape avec une bulle de dialogue.
 */
import { el } from './dom.js';

export type ChefMood = 'idle' | 'happy' | 'worried';

const OUTLINE = '#5a3a2a';
const SKIN = '#c98b5e';
const HAIR = '#3b2418';

function eyes(mood: ChefMood): string {
  if (mood === 'happy') {
    // Yeux plissés de joie « ^ ^ ».
    return `<path d="M40 70 q6 -8 12 0 M68 70 q6 -8 12 0" fill="none" stroke="${OUTLINE}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  const brows =
    mood === 'worried'
      ? `<path d="M38 58 l13 4 M82 58 l-13 4" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`
      : `<path d="M39 59 q7 -4 13 0 M68 59 q7 -4 13 0" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>`;
  return `${brows}
    <ellipse cx="46" cy="70" rx="6" ry="7.5" fill="${OUTLINE}"/><ellipse cx="74" cy="70" rx="6" ry="7.5" fill="${OUTLINE}"/>
    <circle cx="48" cy="67" r="2.3" fill="#fff"/><circle cx="76" cy="67" r="2.3" fill="#fff"/>`;
}

function mouth(mood: ChefMood): string {
  if (mood === 'happy') {
    return `<path d="M50 82 q10 14 20 0 z" fill="#d9534f" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  if (mood === 'worried') {
    return `<path d="M52 86 q4 -4 8 0 q4 4 8 0" fill="none" stroke="${OUTLINE}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M90 52 q5 8 0 11 q-5 -3 0 -11 z" fill="#8fd3f4" stroke="${OUTLINE}" stroke-width="1.5"/>`;
  }
  return `<path d="M52 83 q8 7 16 0" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`;
}

/** Dessin de la cheffe selon son humeur. */
export function chefSvg(mood: ChefMood): string {
  return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- corps : haut rouge, tablier blanc avec un cœur -->
  <path d="M22 150 q2 -38 38 -42 q36 4 38 42 z" fill="#e4572e" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M40 150 v-30 q20 -8 40 0 v30 z" fill="#fff" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M60 134 c-6 -6 -12 0 -6 5 l6 5 l6 -5 c6 -5 0 -11 -6 -5 z" fill="#ff8fab"/>
  <!-- foulard -->
  <path d="M46 106 q14 8 28 0 l-6 10 h-16 z" fill="#ffd166" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- cheveux (arrière) -->
  <ellipse cx="60" cy="68" rx="38" ry="36" fill="${HAIR}"/>
  <!-- visage -->
  <ellipse cx="60" cy="72" rx="32" ry="31" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M30 62 q12 -22 30 -18 q18 -4 30 18 q-14 -10 -30 -8 q-16 -2 -30 8 z" fill="${HAIR}"/>
  <!-- joues -->
  <ellipse cx="38" cy="81" rx="6" ry="4" fill="#ff8fab" opacity="0.75"/>
  <ellipse cx="82" cy="81" rx="6" ry="4" fill="#ff8fab" opacity="0.75"/>
  ${eyes(mood)}
  ${mouth(mood)}
  <!-- toque -->
  <path d="M30 42 q-10 -22 10 -26 q6 -14 20 -10 q14 -4 20 10 q20 4 10 26 z" fill="#fff" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>
  <rect x="30" y="38" width="60" height="10" rx="4" fill="#fff" stroke="${OUTLINE}" stroke-width="3"/>
</svg>`;
}

/** La cheffe et sa bulle : `say` change ce qu'elle dit et son humeur. */
export class Chef {
  readonly root: HTMLElement;
  private readonly face = el('div', { class: 'chef-face' });
  private readonly bubble = el('div', { class: 'chef-bubble' });
  private mood: ChefMood | null = null;

  constructor() {
    this.root = el('div', { class: 'chef' }, [this.face, this.bubble]);
    this.say('', 'idle');
  }

  say(text: string, mood: ChefMood = 'idle'): void {
    if (mood !== this.mood) {
      this.face.innerHTML = chefSvg(mood);
      this.mood = mood;
    }
    this.root.className = `chef ${mood}`;
    this.bubble.textContent = text;
    this.bubble.hidden = !text;
    // Petite animation à chaque réplique.
    this.root.classList.remove('talk');
    void this.root.offsetWidth;
    this.root.classList.add('talk');
  }
}
