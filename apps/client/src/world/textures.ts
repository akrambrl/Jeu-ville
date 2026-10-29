/** Textures dessinées en code (sols, façades, enseignes). */
import * as THREE from 'three';
import { vivid } from './kawaii.js';

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

// ---------- Sols ----------

/** Aplat de couleur (monde « jouet » : pas de grain réaliste). */
function flat(c: CanvasRenderingContext2D, color: string): void {
  c.fillStyle = color;
  c.fillRect(0, 0, 64, 64);
}

export const GROUND_TEXTURES = {
  grass: () =>
    canvasTexture(64, 64, (c) => {
      flat(c, '#4cd964');
      // Touffes d'herbe et petites fleurs, dessinées comme dans un jeu.
      const r = seeded(2);
      c.fillStyle = '#3cbf55';
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(r() * 56) + 4;
        const y = Math.floor(r() * 56) + 4;
        c.beginPath();
        c.moveTo(x - 4, y + 3);
        c.lineTo(x - 2, y - 3);
        c.lineTo(x, y + 1);
        c.lineTo(x + 2, y - 4);
        c.lineTo(x + 4, y + 3);
        c.fill();
      }
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(r() * 56) + 4;
        const y = Math.floor(r() * 56) + 4;
        c.fillStyle = ['#ffffff', '#ff5d8f', '#ffd60a'][i]!;
        c.beginPath();
        c.arc(x, y, 2.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffd60a';
        c.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }),
  sidewalk: () =>
    canvasTexture(64, 64, (c) => {
      flat(c, '#ffe9a8');
      // Gros pavés arrondis.
      c.fillStyle = '#fff3cf';
      for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) {
        c.beginPath();
        c.roundRect(x + 3, y + 3, 26, 26, 7);
        c.fill();
      }
    }),
  road: () => canvasTexture(64, 64, (c) => flat(c, '#6c7ae0')),
  majorRoad: () => canvasTexture(64, 64, (c) => flat(c, '#5b68d1')),
  yard: () => canvasTexture(64, 64, (c) => flat(c, '#f1d9ff')),
  rail: () =>
    canvasTexture(64, 64, (c) => {
      flat(c, '#d9a066');
      c.fillStyle = '#a0522d';
      for (let x = 2; x < 64; x += 11) c.fillRect(x, 6, 6, 52);
      c.fillStyle = '#e8e8f0';
      c.fillRect(0, 17, 64, 4);
      c.fillRect(0, 43, 64, 4);
    }),
  platform: () =>
    canvasTexture(64, 64, (c) => {
      flat(c, '#ffffff');
      c.fillStyle = '#ffd60a';
      c.fillRect(0, 0, 64, 7);
      c.fillRect(0, 57, 64, 7);
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
    const glass = style.window ?? '#5ad1ff';
    const frame = style.frame ?? '#ffffff';
    // Mêmes emplacements que les fenêtres allumées la nuit (night.ts).
    const spots = style.wide ? [[6, 52]] : [[10, 16], [38, 16]];
    for (const [x, w] of spots as [number, number][]) {
      // Contour sombre épais, puis cadre blanc : effet dessin animé.
      c.fillStyle = OUTLINE;
      roundRect(c, x - 4, 12, w + 8, 40, 8);
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
    // Plinthe sombre entre deux étages, comme des blocs empilés.
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, 60, 64, 4);
  });
}

/** Contour des dessins (fenêtres, vitrines). */
const OUTLINE = '#2d2a4a';

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
    c.fillStyle = vivid(style.wall);
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
    c.fillStyle = OUTLINE;
    roundRect(c, 5, 56, 118, 70, 12);
    c.fillStyle = '#ffffff';
    roundRect(c, 8, 59, 112, 64, 10);
    c.fillStyle = vivid(style.glass ?? '#3d9bd5');
    roundRect(c, 11, 62, 106, 62, 8);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(18, 66, 6, 30);
    c.fillRect(28, 66, 3, 14);
    c.fillStyle = vivid(style.door ?? '#c0392b');
    roundRect(c, 55, 66, 20, 58, 6);
  });
}

/** Texture de toit (gravillons, ardoise, zinc, tuiles). */
export function roofTexture(base: string, lines?: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (c) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 64, 64);
    if (lines) {
      // Tuiles en écailles, rangée par rangée (décalées une sur deux).
      c.strokeStyle = lines;
      c.lineWidth = 2.5;
      for (let row = 0; row < 4; row++) {
        const y = row * 16 + 16;
        for (let x = row % 2 ? -8 : 0; x < 64; x += 16) {
          c.beginPath();
          c.arc(x + 8, y - 8, 8, 0, Math.PI);
          c.stroke();
        }
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
