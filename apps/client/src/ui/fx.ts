/**
 * Effets du jeu : petits sons synthétisés (aucun fichier à charger) et
 * confettis. Le son se coupe avec le bouton 🔊, et le choix est mémorisé.
 */

const MUTE_KEY = 'bac-bataille.muted';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* navigation privée */
  }
}

/** Bouton 🔊/🔇 qui coupe ou remet le son. */
export function muteButton(className: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  const paint = () => {
    b.textContent = muted ? '🔇' : '🔊';
    b.title = muted ? 'Remettre le son' : 'Couper le son';
  };
  paint();
  b.addEventListener('click', () => {
    setMuted(!muted);
    paint();
    if (!muted) play('tap');
  });
  return b;
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new Ctx();
    void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Une note : fréquence (Hz), début et durée (s) relatifs, forme d'onde, volume. */
type Note = [freq: number, at: number, dur: number, wave?: OscillatorType, vol?: number, slideTo?: number];

const SOUNDS = {
  tap: [[660, 0, 0.06, 'triangle', 0.15]],
  flip: [[1200, 0, 0.05, 'square', 0.05, 500]],
  letter: [[520, 0, 0.08, 'triangle', 0.18], [780, 0.09, 0.14, 'triangle', 0.2]],
  duel: [[300, 0, 0.18, 'sawtooth', 0.12, 900], [900, 0.2, 0.12, 'square', 0.1]],
  right: [[660, 0, 0.09, 'triangle', 0.22], [880, 0.09, 0.09, 'triangle', 0.22], [1320, 0.18, 0.2, 'triangle', 0.22]],
  wrong: [[160, 0, 0.28, 'sawtooth', 0.16, 110]],
  lose: [[440, 0, 0.15, 'triangle', 0.18, 330], [330, 0.16, 0.25, 'triangle', 0.18, 220]],
  fanfare: [
    [523, 0, 0.12, 'square', 0.12],
    [659, 0.12, 0.12, 'square', 0.12],
    [784, 0.24, 0.12, 'square', 0.12],
    [1046, 0.36, 0.4, 'square', 0.14],
  ],
  tick: [[1500, 0, 0.03, 'square', 0.05]],
  /** Pièces d'or qui tintent. */
  coin: [[1568, 0, 0.07, 'triangle', 0.14], [2093, 0.06, 0.16, 'triangle', 0.12]],
  /** Une pièce qui tombe dans la bourse : tintement métallique (partiels non harmoniques). */
  clink: [[2480, 0, 0.07, 'square', 0.035], [3720, 0, 0.16, 'triangle', 0.11], [5350, 0.004, 0.1, 'sine', 0.05]],
  /** Tiroir-caisse : « ka-ching ! » quand toutes les pièces sont rangées. */
  cash: [[1318, 0, 0.07, 'square', 0.07], [1760, 0.08, 0.32, 'triangle', 0.15], [2637, 0.08, 0.32, 'sine', 0.08], [3520, 0.1, 0.25, 'sine', 0.04]],
} satisfies Record<string, Note[]>;

export type SoundName = keyof typeof SOUNDS;

/** Joue un son ; `pitch` le rend plus aigu (> 1) ou plus grave (< 1). */
export function play(name: SoundName, pitch = 1): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  for (const [freq, at, dur, wave = 'triangle', vol = 0.15, slideTo] of SOUNDS[name] as Note[]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq * pitch, t0 + at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo * pitch, t0 + at + dur);
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

const CONFETTI_COLORS = ['#ff3d7f', '#ffc93c', '#2ee6d6', '#9be15d', '#8f6bff', '#ffffff'];
/** Confettis : nombre de morceaux et durée de chute (ms). */
const CONFETTI_COUNT = 70;
const CONFETTI_MS = 1_800;

/** Pluie de confettis partant de (x, y), ou du haut de l'écran. */
export function confetti(origin?: { x: number; y: number }): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  document.body.append(layer);
  const ox = origin?.x ?? window.innerWidth / 2;
  const oy = origin?.y ?? window.innerHeight * 0.35;
  for (let k = 0; k < CONFETTI_COUNT; k++) {
    const piece = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 260;
    piece.style.left = `${ox}px`;
    piece.style.top = `${oy}px`;
    piece.style.background = CONFETTI_COLORS[k % CONFETTI_COLORS.length]!;
    piece.style.setProperty('--dx', `${Math.cos(angle) * speed}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * speed - 120}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    layer.append(piece);
  }
  window.setTimeout(() => layer.remove(), CONFETTI_MS + 200);
}
