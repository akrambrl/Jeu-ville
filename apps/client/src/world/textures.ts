/** Textures dessinées en code (sols, façades, enseignes). */
import * as THREE from 'three';

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Générateur pseudo-aléatoire déterministe. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, size: number, base: string, amount: number, count: number, seed: number): void {
  const r = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const light = r() < 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${r() * amount})` : `rgba(0,0,0,${r() * amount})`;
    ctx.fillRect(r() * size, r() * size, 2, 2);
  }
}

// ---------- Sols ----------

export const GROUND_TEXTURES = {
  grass: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#7dbf5b', 0.12, 700, 1);
      const r = seeded(2);
      c.fillStyle = 'rgba(40,95,30,0.3)';
      for (let i = 0; i < 70; i++) c.fillRect(r() * 64, r() * 64, 1, 3);
    }),
  sidewalk: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#ddd5c6', 0.06, 300, 3);
      c.strokeStyle = 'rgba(120,100,80,0.28)';
      for (let k = 0; k <= 64; k += 16) {
        c.beginPath();
        c.moveTo(k, 0);
        c.lineTo(k, 64);
        c.moveTo(0, k);
        c.lineTo(64, k);
        c.stroke();
      }
    }),
  road: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#5b626e', 0.08, 900, 4)),
  majorRoad: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#505763', 0.08, 900, 5)),
  yard: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#b7bcc4', 0.06, 400, 6)),
  rail: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#8b7b66', 0.15, 800, 7);
      c.fillStyle = '#5b4a3a';
      for (let x = 2; x < 64; x += 11) c.fillRect(x, 6, 5, 52);
      c.fillStyle = '#c9ccd2';
      c.fillRect(0, 18, 64, 3);
      c.fillRect(0, 43, 64, 3);
    }),
  platform: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#d2cec5', 0.05, 200, 8);
      c.fillStyle = '#e8c547';
      c.fillRect(0, 0, 64, 6);
      c.fillRect(0, 58, 64, 6);
    }),
};

// ---------- Façades ----------

/** Une travée de façade : une case de large, un étage de haut (répétée). */
export interface FacadeStyle {
  wall: string;
  window?: string;
  frame?: string;
  balcony?: boolean;
  shutters?: string;
  arched?: boolean;
  /** Bandeau horizontal en haut de l'étage. */
  band?: string;
  wide?: boolean;
}

export function facadeTexture(style: FacadeStyle): THREE.CanvasTexture {
  return canvasTexture(64, 64, (c) => {
    c.fillStyle = style.wall;
    c.fillRect(0, 0, 64, 64);
    // Léger grain
    const r = seeded(style.wall.length * 31);
    for (let i = 0; i < 120; i++) {
      c.fillStyle = `rgba(0,0,0,${r() * 0.04})`;
      c.fillRect(r() * 64, r() * 64, 2, 2);
    }
    const glass = style.window ?? '#4b6584';
    const frame = style.frame ?? '#f7f3ec';
    const spots = style.wide ? [[6, 52]] : [[8, 20], [36, 20]];
    for (const [x, w] of spots as [number, number][]) {
      c.fillStyle = frame;
      c.fillRect(x - 2, 14, w + 4, 36);
      c.fillStyle = glass;
      if (style.arched) {
        c.beginPath();
        c.moveTo(x, 48);
        c.lineTo(x, 26);
        c.arc(x + w / 2, 26, w / 2, Math.PI, 0);
        c.lineTo(x + w, 48);
        c.closePath();
        c.fill();
      } else {
        c.fillRect(x, 16, w, 32);
      }
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fillRect(x + 2, 18, 4, 28);
      if (style.shutters) {
        c.fillStyle = style.shutters;
        c.fillRect(x - 7, 15, 5, 34);
        c.fillRect(x + w + 2, 15, 5, 34);
      }
      if (style.balcony) {
        c.fillStyle = '#7d838c';
        c.fillRect(x - 4, 46, w + 8, 4);
        c.fillStyle = 'rgba(60,70,80,0.6)';
        for (let k = x - 3; k < x + w + 4; k += 4) c.fillRect(k, 38, 1, 8);
        c.fillRect(x - 4, 37, w + 8, 1);
      }
    }
    if (style.band) {
      c.fillStyle = style.band;
      c.fillRect(0, 0, 64, 6);
    }
    c.fillStyle = 'rgba(0,0,0,0.07)';
    c.fillRect(0, 61, 64, 3);
  });
}

/** Rez-de-chaussée avec enseigne (commerces, équipements). */
export interface FrontStyle {
  wall: string;
  sign: string;
  signBg: string;
  signFg: string;
  glass?: string;
  awning?: [string, string];
  /** Croix de pharmacie. */
  cross?: boolean;
  door?: string;
}

export function storefrontTexture(style: FrontStyle): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c) => {
    c.fillStyle = style.wall;
    c.fillRect(0, 0, 128, 128);
    // Enseigne
    c.fillStyle = style.signBg;
    c.fillRect(4, 6, 120, 30);
    c.fillStyle = style.signFg;
    c.font = `bold ${style.sign.length > 9 ? 17 : 22}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(style.sign, style.cross ? 54 : 64, 22, 104);
    if (style.cross) {
      c.fillStyle = '#3fe07a';
      c.fillRect(104, 12, 18, 6);
      c.fillRect(110, 6, 6, 18);
      c.fillRect(104, 18, 18, 6);
      c.fillRect(110, 18, 6, 12);
    }
    // Store
    if (style.awning) {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = style.awning[k % 2]!;
        c.fillRect(k * 16, 38, 16, 14);
      }
    }
    // Vitrine + porte
    c.fillStyle = style.glass ?? '#3d5570';
    c.fillRect(10, 56, 108, 66);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(16, 60, 8, 58);
    c.fillStyle = style.door ?? '#2a3442';
    c.fillRect(56, 64, 18, 58);
  });
}

/** Texture de toit (gravillons, ardoise, zinc, tuiles). */
export function roofTexture(base: string, lines?: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (c) => {
    speckle(c, 64, base, 0.08, 300, base.length);
    if (lines) {
      c.strokeStyle = lines;
      for (let y = 4; y < 64; y += 8) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(64, y);
        c.stroke();
      }
    }
  });
}

/** Plaque texte (enseigne en façade, au-dessus de l'entrée). */
export function signTexture(text: string, bg: string, fg: string, extra?: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return canvasTexture(256, 64, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = fg;
    c.font = 'bold 34px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 34, 236);
    extra?.(c);
  });
}
