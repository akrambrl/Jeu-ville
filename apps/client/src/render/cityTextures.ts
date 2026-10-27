/** Génère les textures de la ville (sol + blocs d'immeubles) sans asset externe. */
import Phaser from 'phaser';
import { DECOR, TILE } from '@jeu-ville/shared';
import { GROUND_COLORS } from './palette.js';
import { LEVEL_PX, TILE_H, TILE_W, boxColors, drawBox, makeCanvas, polygon, project, shade } from './iso.js';

export const GROUND_TEXTURE = 'ground';
export const MARKER_TEXTURE = 'tile-marker';

/** Petit bruit déterministe pour varier les détails. */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Losange d'une case, légèrement agrandi pour éviter les jointures visibles. */
function diamond(ox: number, oy: number, grow = 0.6): [number, number][] {
  const hw = TILE_W / 2 + grow;
  const hh = TILE_H / 2 + grow / 2;
  return [
    [ox, oy - hh],
    [ox + hw, oy],
    [ox, oy + hh],
    [ox - hw, oy],
  ];
}

function drawGroundTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, code: string, mark: string): void {
  const color = GROUND_COLORS[code] ?? GROUND_COLORS[TILE.ground]!;
  polygon(ctx, diamond(ox, oy), shade(color, 1));
  const r = rand(code.charCodeAt(0));
  ctx.save();
  ctx.beginPath();
  const d = diamond(ox, oy, 0);
  ctx.moveTo(...d[0]!);
  for (const p of d.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  ctx.clip();
  if (code === TILE.grass || code === TILE.ground) {
    // Touffes d'herbe
    for (let i = 0; i < 6; i++) {
      const x = ox + (r() - 0.5) * 40;
      const y = oy + (r() - 0.5) * 18;
      ctx.fillStyle = shade(color, 0.85 + r() * 0.1);
      ctx.fillRect(Math.round(x), Math.round(y), 3, 2);
    }
  } else if (code === TILE.pedestrian) {
    // Joints de dalles
    ctx.strokeStyle = shade(color, 0.9);
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(...project(ox, oy, -16, k * 8, 0));
      ctx.lineTo(...project(ox, oy, 16, k * 8, 0));
      ctx.moveTo(...project(ox, oy, k * 8, -16, 0));
      ctx.lineTo(...project(ox, oy, k * 8, 16, 0));
      ctx.stroke();
    }
  } else if (code === TILE.road || code === TILE.majorRoad) {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = shade(color, 1.08);
      ctx.fillRect(Math.round(ox + (r() - 0.5) * 40), Math.round(oy + (r() - 0.5) * 16), 2, 1);
    }
  } else if (code === TILE.rail) {
    ctx.fillStyle = shade(0x5b4a3a, 1);
    for (let k = -12; k <= 12; k += 6) {
      polygon(ctx, [project(ox, oy, k - 1.5, -14, 0), project(ox, oy, k + 1.5, -14, 0), project(ox, oy, k + 1.5, 14, 0), project(ox, oy, k - 1.5, 14, 0)], '#5b4a3a');
    }
    ctx.strokeStyle = '#c9ccd2';
    ctx.lineWidth = 1.5;
    for (const yy of [-6, 6]) {
      ctx.beginPath();
      ctx.moveTo(...project(ox, oy, -16, yy, 0));
      ctx.lineTo(...project(ox, oy, 16, yy, 0));
      ctx.stroke();
    }
  } else if (code === TILE.yard) {
    // Enrobé de cour d'école, quelques gravillons.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = shade(color, 1.06);
      ctx.fillRect(Math.round(ox + (r() - 0.5) * 40), Math.round(oy + (r() - 0.5) * 16), 2, 1);
    }
  } else if (code === TILE.platform) {
    // Quai : bande d'éveil jaune côté voies.
    const q = (y0: number, y1: number, fill: string) =>
      polygon(ctx, [project(ox, oy, -17, y0, 0), project(ox, oy, 17, y0, 0), project(ox, oy, 17, y1, 0), project(ox, oy, -17, y1, 0)], fill);
    q(-16, -13, '#e8c547');
    q(13, 16, '#e8c547');
  } else if (code === TILE.water) {
    ctx.strokeStyle = shade(color, 1.2);
    ctx.beginPath();
    ctx.moveTo(ox - 10, oy);
    ctx.lineTo(ox - 2, oy - 2);
    ctx.stroke();
  }
  drawMarking(ctx, ox, oy, mark);
  ctx.restore();
}

/** Marquages au sol et fleurs (couche décor « à plat »). */
function drawMarking(ctx: CanvasRenderingContext2D, ox: number, oy: number, mark: string): void {
  const white = 'rgba(245,245,240,0.9)';
  const quad = (x0: number, y0: number, x1: number, y1: number, fill: string) =>
    polygon(ctx, [project(ox, oy, x0, y0, 0), project(ox, oy, x1, y0, 0), project(ox, oy, x1, y1, 0), project(ox, oy, x0, y1, 0)], fill);
  const tram = TRAM_RAILS[mark];
  if (tram) {
    // Plateforme de tram (béton clair) et rail, le long du bord de la case.
    for (const [axis, side] of tram) {
      const edge = side === 'a' ? 16 : -16;
      const inner = side === 'a' ? 9 : -9;
      const rail = side === 'a' ? 11 : -11;
      if (axis === 'x') {
        quad(-17, Math.min(edge, inner), 17, Math.max(edge, inner), 'rgba(205,205,200,0.55)');
        quad(-17, rail - 0.9, 17, rail + 0.9, '#6d737c');
      } else {
        quad(Math.min(edge, inner), -17, Math.max(edge, inner), 17, 'rgba(205,205,200,0.55)');
        quad(rail - 0.9, -17, rail + 0.9, 17, '#6d737c');
      }
    }
    return;
  }
  switch (mark) {
    case DECOR.laneX:
      quad(-8, 14.5, 8, 17.5, white);
      break;
    case DECOR.laneY:
      quad(14.5, -8, 17.5, 8, white);
      break;
    case DECOR.crossingX:
      for (const y of [-12, -4, 4, 12]) quad(-11, y - 2, 11, y + 2, white);
      break;
    case DECOR.crossingY:
      for (const x of [-12, -4, 4, 12]) quad(x - 2, -11, x + 2, 11, white);
      break;
    case DECOR.railCrossing:
      for (const y of [-6, 6]) quad(-17, y - 0.8, 17, y + 0.8, '#8d939c');
      break;
    case DECOR.parking:
      // Lignes de places de stationnement.
      for (const x of [-16, 15]) quad(x, -14, x + 1.2, 14, white);
      quad(-16, 13, 16.2, 14.2, white);
      break;
    case DECOR.hopscotch: {
      const colors = ['#f2d14b', '#e8607a', '#5fb3e0', '#7fcf7a'];
      for (let k = 0; k < 4; k++) quad(-12 + k * 6, -3, -7 + k * 6, 3, colors[k]!);
      quad(-12, -9, -7, -4, colors[2]!);
      quad(-12, 4, -7, 9, colors[3]!);
      break;
    }
    case DECOR.flowers: {
      const colors = ['#f2d14b', '#e8607a', '#ffffff', '#b07ce0'];
      const r = rand(7);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = colors[i % colors.length]!;
        const [x, y] = project(ox, oy, (r() - 0.5) * 24, (r() - 0.5) * 24, 0);
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
      }
      break;
    }
  }
}

/** Rails de tram par code : (axe du rail, côté de la case : a = bord positif). */
const TRAM_RAILS: Record<string, ['x' | 'y', 'a' | 'b'][]> = {
  [DECOR.tramXa]: [['x', 'a']],
  [DECOR.tramXb]: [['x', 'b']],
  [DECOR.tramYa]: [['y', 'a']],
  [DECOR.tramYb]: [['y', 'b']],
  [DECOR.tramXaYa]: [['x', 'a'], ['y', 'a']],
  [DECOR.tramXaYb]: [['x', 'a'], ['y', 'b']],
  [DECOR.tramXbYa]: [['x', 'b'], ['y', 'a']],
  [DECOR.tramXbYb]: [['x', 'b'], ['y', 'b']],
};

const ROAD_MARKS = [
  DECOR.laneX,
  DECOR.laneY,
  DECOR.crossingX,
  DECOR.crossingY,
  DECOR.railCrossing,
  ...Object.keys(TRAM_RAILS),
];

/** Décors dessinés à plat dans le sol (le reste est en relief, voir les props). */
const FLAT_DECOR = new Set<string>([...ROAD_MARKS, DECOR.flowers, DECOR.hopscotch, DECOR.parking]);

/** Nom de frame du sol pour une case. */
export function groundFrame(code: string, decor: string): string {
  return FLAT_DECOR.has(decor) && GROUND_FRAMES.has(code + decor) ? code + decor : code;
}

const GROUND_FRAMES = new Set<string>([
  ...Object.keys(GROUND_COLORS),
  ...[TILE.road, TILE.majorRoad].flatMap((c) => ROAD_MARKS.map((m) => c + m)),
  TILE.grass + DECOR.flowers,
  TILE.pedestrian + DECOR.flowers,
  TILE.yard + DECOR.hopscotch,
  TILE.pedestrian + DECOR.parking,
]);

/** Atlas des sols : une frame par code de case. */
export function createGroundTextures(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(GROUND_TEXTURE)) return;
  const frames = [...GROUND_FRAMES];
  const fw = TILE_W + 2;
  const fh = TILE_H + 2;
  const { canvas, ctx } = makeCanvas(fw * frames.length, fh);
  frames.forEach((frame, i) => drawGroundTile(ctx, i * fw + fw / 2, fh / 2, frame[0]!, frame.slice(1)));
  const tex = textures.addCanvas(GROUND_TEXTURE, canvas)!;
  frames.forEach((frame, i) => tex.add(frame, 0, i * fw, 0, fw, fh));

  const m = makeCanvas(TILE_W + 4, TILE_H + 4);
  polygon(m.ctx, diamond(m.canvas.width / 2, m.canvas.height / 2, 0), 'rgba(255,255,255,0.35)', '#ffffff');
  textures.addCanvas(MARKER_TEXTURE, m.canvas);
}

// ---------- Objets du décor en relief ----------

export const PROP_DECOR = new Set<string>([DECOR.tree, DECOR.lamp, DECOR.bench, DECOR.flag, DECOR.shelter, DECOR.hoop, DECOR.car, DECOR.policeCar]);
const PROP_W = 48;
const PROP_H = 72;
/** Pied de l'objet dans la texture (pour `setOrigin`). */
export const PROP_ORIGIN_Y = (PROP_H - 12) / PROP_H;

export function propTextureKey(decor: string, variant: number): string {
  return `prop-${decor}-${variant}`;
}

/** Arbre, lampadaire ou banc en petits blocs. */
export function ensurePropTexture(textures: Phaser.Textures.TextureManager, decor: string, variant: number): string {
  const key = propTextureKey(decor, variant);
  if (textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(PROP_W, PROP_H);
  const ox = PROP_W / 2;
  const oy = PROP_H - 12;
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) =>
    drawBox(ctx, ox, oy, { x0, y0, z0, x1, y1, z1 }, boxColors(color));
  if (decor === DECOR.tree) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(ox, oy, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    const leaves = [0x5aa548, 0x4c9a52, 0x6fb34a][variant % 3]!;
    box(-2, -2, 0, 2, 2, 12, 0x8a5a3b);
    if (variant % 2 === 0) {
      box(-9, -9, 10, 9, 9, 22, leaves);
      box(-6, -6, 22, 6, 6, 30, shade2(leaves, 1.08));
    } else {
      box(-7, -7, 10, 7, 7, 34, leaves);
    }
  } else if (decor === DECOR.lamp) {
    box(-1, -1, 0, 1, 1, 30, 0x3a3f4a);
    box(-3, -3, 30, 3, 3, 33, 0x3a3f4a);
    box(-2, -2, 28, 2, 2, 30, 0xffe9a8);
  } else if (decor === DECOR.flag) {
    // Drapeau tricolore sur son mât.
    box(-0.6, -0.6, 0, 0.6, 0.6, 26, 0xdcdcdc);
    const flag = (x0: number, x1: number, color: string) =>
      polygon(ctx, [project(ox, oy, x0, 0, 25), project(ox, oy, x1, 0, 25), project(ox, oy, x1, 0, 18), project(ox, oy, x0, 0, 18)], color);
    flag(0.6, 4.5, '#1f4ea8');
    flag(4.5, 8.5, '#ffffff');
    flag(8.5, 12.5, '#e1373c');
  } else if (decor === DECOR.shelter) {
    // Abri de tram : poteaux, vitre, toit et plaque « T1 ».
    box(-10, -6, 0, -9, -5, 20, 0x5b6470);
    box(9, -6, 0, 10, -5, 20, 0x5b6470);
    box(-10, -7, 4, 10, -6, 19, 0xbcd6e6);
    box(-12, -8, 20, 12, 4, 22, 0x2f6fb5);
    box(10, 2, 0, 11, 3, 26, 0x5b6470);
    box(8, 2, 22, 14, 3, 28, 0x2f6fb5);
  } else if (decor === DECOR.hoop) {
    // Panier de basket.
    box(-1, -1, 0, 1, 1, 30, 0x5b6470);
    box(-6, 1, 24, 6, 2, 33, 0xffffff);
    box(-2.5, 2, 24, 2.5, 6, 25, 0xf07a2a);
  } else if (decor === DECOR.car || decor === DECOR.policeCar) {
    // Voiture garée (orientée selon y, nez vers la caméra).
    const police = decor === DECOR.policeCar;
    const body = police ? 0xf4f5f7 : [0xd94f3d, 0x3b6ea8, 0xe9e9e9, 0x2f2f38, 0xe0a530][variant % 5]!;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(ox, oy, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [[-7, -10], [5, -10], [-7, 8], [5, 8]] as const) box(x, y, 0, x + 2, y + 3, 4, 0x1d1d22);
    box(-7, -13, 2, 7, 13, 8, body);
    box(-6, -7, 8, 6, 6, 13, police ? 0xf4f5f7 : body);
    // Vitres
    polygon(ctx, [project(ox, oy, -5, 6, 8.5), project(ox, oy, 5, 6, 8.5), project(ox, oy, 5, 6, 12.5), project(ox, oy, -5, 6, 12.5)], '#2c3b4d');
    polygon(ctx, [project(ox, oy, 6, -6, 8.5), project(ox, oy, 6, 5, 8.5), project(ox, oy, 6, 5, 12.5), project(ox, oy, 6, -6, 12.5)], '#3a4d63');
    if (police) {
      polygon(ctx, [project(ox, oy, 7, -12, 3.5), project(ox, oy, 7, 12, 3.5), project(ox, oy, 7, 12, 5.5), project(ox, oy, 7, -12, 5.5)], '#1f3f8c');
      box(-3, -2, 13, -0.5, 1, 15, 0x2f6fe0);
      box(0.5, -2, 13, 3, 1, 15, 0xe1373c);
    }
  } else if (decor === DECOR.bench) {
    box(-8, -3, 0, -6, 3, 4, 0x3a3f4a);
    box(6, -3, 0, 8, 3, 4, 0x3a3f4a);
    box(-9, -3, 4, 9, 3, 6, 0xb07a4f);
    box(-9, -4, 6, 9, -3, 11, 0xb07a4f);
  }
  textures.addCanvas(key, canvas);
  return key;
}

function shade2(color: number, factor: number): number {
  const c = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * factor));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
