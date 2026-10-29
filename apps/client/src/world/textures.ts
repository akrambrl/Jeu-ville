/** Textures dessinées en code (sols, façades, enseignes). */
import * as THREE from 'three';
import { pastel } from './kawaii.js';

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
      speckle(c, 64, '#74d17a', 0.08, 500, 1);
      // Petites fleurs semées dans l'herbe.
      const r = seeded(2);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = ['#ffffff', '#ffb3c7', '#fff1a8'][i % 3]!;
        c.fillRect(Math.floor(r() * 62), Math.floor(r() * 62), 2, 2);
      }
    }),
  sidewalk: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#ffe4dc', 0.04, 200, 3);
      c.strokeStyle = 'rgba(232,160,170,0.45)';
      for (let k = 0; k <= 64; k += 16) {
        c.beginPath();
        c.moveTo(k, 0);
        c.lineTo(k, 64);
        c.moveTo(0, k);
        c.lineTo(64, k);
        c.stroke();
      }
    }),
  road: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#9a90c8', 0.05, 500, 4)),
  majorRoad: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#8b80bd', 0.05, 500, 5)),
  yard: () => canvasTexture(64, 64, (c) => speckle(c, 64, '#e3dcef', 0.04, 300, 6)),
  rail: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#c9b39a', 0.1, 500, 7);
      c.fillStyle = '#9a7a5e';
      for (let x = 2; x < 64; x += 11) c.fillRect(x, 6, 5, 52);
      c.fillStyle = '#c9ccd2';
      c.fillRect(0, 18, 64, 3);
      c.fillRect(0, 43, 64, 3);
    }),
  platform: () =>
    canvasTexture(64, 64, (c) => {
      speckle(c, 64, '#f6efe6', 0.04, 200, 8);
      c.fillStyle = '#ffd166';
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
    const glass = style.window ?? '#8fcdf0';
    const frame = style.frame ?? '#ffffff';
    // Mêmes emplacements que les fenêtres allumées la nuit (night.ts).
    const spots = style.wide ? [[6, 52]] : [[10, 16], [38, 16]];
    for (const [x, w] of spots as [number, number][]) {
      c.fillStyle = frame;
      roundRect(c, x - 2, 14, w + 4, 36, 6);
      c.fillStyle = glass;
      if (!style.arched) {
        roundRect(c, x, 16, w, 32, 5);
      } else {
        c.beginPath();
        c.moveTo(x, 48);
        c.lineTo(x, 26);
        c.arc(x + w / 2, 26, w / 2, Math.PI, 0);
        c.lineTo(x + w, 48);
        c.closePath();
        c.fill();
      }
      // Reflet en biais, façon dessin animé.
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillRect(x + 3, 19, 3, 12);
      c.fillRect(x + 8, 19, 2, 6);
      if (style.shutters) {
        c.fillStyle = style.shutters;
        c.fillRect(x - 7, 15, 5, 34);
        c.fillRect(x + w + 2, 15, 5, 34);
      }
      if (style.balcony) {
        c.fillStyle = '#ffffff';
        c.fillRect(x - 4, 46, w + 8, 3);
        for (let k = x - 3; k < x + w + 4; k += 6) c.fillRect(k, 39, 1, 7);
        c.fillRect(x - 4, 38, w + 8, 2);
      } else {
        // Jardinière fleurie sous la fenêtre.
        c.fillStyle = '#7cc47f';
        roundRect(c, x - 2, 47, w + 4, 5, 2);
        for (let k = 0; k < w; k += 5) {
          c.fillStyle = ['#ff8fab', '#ffd166', '#ffffff'][(k / 5 + x) % 3]!;
          c.fillRect(x + k, 44, 3, 3);
        }
      }
    }
    if (style.band) {
      c.fillStyle = style.band;
      c.fillRect(0, 0, 64, 6);
    }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(0, 61, 64, 3);
  });
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
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
    c.fillStyle = pastel(style.wall, 0.3);
    c.fillRect(0, 0, 128, 128);
    // Enseigne
    c.fillStyle = style.signBg;
    roundRect(c, 4, 6, 120, 30, 10);
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
      // Store à festons.
      for (let k = 0; k < 8; k++) {
        c.fillStyle = style.awning[k % 2]!;
        c.fillRect(k * 16, 38, 16, 10);
        c.beginPath();
        c.arc(k * 16 + 8, 48, 8, 0, Math.PI);
        c.fill();
      }
    }
    // Vitrine + porte
    c.fillStyle = '#ffffff';
    roundRect(c, 7, 58, 114, 66, 10);
    c.fillStyle = pastel(style.glass ?? '#3d5570', 0.25);
    roundRect(c, 11, 62, 106, 62, 8);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(18, 66, 6, 30);
    c.fillRect(28, 66, 3, 14);
    c.fillStyle = pastel(style.door ?? '#2a3442', 0.2);
    roundRect(c, 55, 66, 20, 58, 6);
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
