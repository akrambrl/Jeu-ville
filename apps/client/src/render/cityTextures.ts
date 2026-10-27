/** Génère les textures de la ville (sol + blocs d'immeubles) sans asset externe. */
import Phaser from 'phaser';
import { DECOR, TILE } from '@jeu-ville/shared';
import { BUILDING_COLORS, GROUND_COLORS, ROOF_COLORS, WINDOW_COLOR } from './palette.js';
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

/** Décors dessinés à plat dans le sol (le reste est en relief, voir les props). */
const FLAT_DECOR = new Set<string>([DECOR.laneX, DECOR.laneY, DECOR.crossingX, DECOR.crossingY, DECOR.flowers]);

/** Nom de frame du sol pour une case. */
export function groundFrame(code: string, decor: string): string {
  return FLAT_DECOR.has(decor) && GROUND_FRAMES.has(code + decor) ? code + decor : code;
}

const GROUND_FRAMES = new Set<string>([
  ...Object.keys(GROUND_COLORS),
  ...[TILE.road, TILE.majorRoad].flatMap((c) => [DECOR.laneX, DECOR.laneY, DECOR.crossingX, DECOR.crossingY].map((m) => c + m)),
  TILE.grass + DECOR.flowers,
  TILE.pedestrian + DECOR.flowers,
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

export function buildingTextureKey(code: string, levels: number): string {
  return `bld-${code}-${levels}`;
}

/** Bloc d'immeuble d'une case, avec fenêtres sur les deux faces visibles. */
export function ensureBuildingTexture(textures: Phaser.Textures.TextureManager, code: string, levels: number): string {
  const key = buildingTextureKey(code, levels);
  if (textures.exists(key)) return key;
  const color = BUILDING_COLORS[code] ?? BUILDING_COLORS[TILE.building]!;
  const heightPx = levels * LEVEL_PX;
  const w = TILE_W + 2;
  const h = TILE_H + heightPx + 2;
  const { canvas, ctx } = makeCanvas(w, h);
  // Origine : centre du losange au sol.
  const ox = w / 2;
  const oy = h - TILE_H / 2 - 1;
  const c = boxColors(color);
  const p = (x: number, y: number, z: number) => project(ox, oy, x, y, z);

  // Faces
  polygon(ctx, [p(-16, 16, 0), p(16, 16, 0), p(16, 16, heightPx), p(-16, 16, heightPx)], c.left);
  polygon(ctx, [p(16, -16, 0), p(16, 16, 0), p(16, 16, heightPx), p(16, -16, heightPx)], c.right);

  // Fenêtres : 2 par étage et par face.
  const win = (face: 'left' | 'right', u: number, z: number) => {
    const ww = 7;
    const wh = 5;
    const pts: [number, number][] =
      face === 'left'
        ? [p(u, 16, z), p(u + ww, 16, z), p(u + ww, 16, z + wh), p(u, 16, z + wh)]
        : [p(16, u, z), p(16, u + ww, z), p(16, u + ww, z + wh), p(16, u, z + wh)];
    polygon(ctx, pts, face === 'left' ? shade(WINDOW_COLOR, 1.1) : shade(WINDOW_COLOR, 0.9));
  };
  for (let lv = 0; lv < levels; lv++) {
    const z = lv * LEVEL_PX + 2;
    for (const u of [-11, 4]) {
      win('left', u, z);
      win('right', u, z);
    }
  }

  // Commerces : store rayé au-dessus du rez-de-chaussée.
  if (code === TILE.commercial) {
    const awning = [0xd94f3d, 0x3b6ea8, 0x4e9a5b, 0xe0a530][levels % 4]!;
    const z0 = LEVEL_PX - 1;
    for (let k = 0; k < 4; k++) {
      const fill = k % 2 === 0 ? shade(awning, 1) : '#f4efe6';
      const u0 = -16 + k * 8;
      polygon(ctx, [p(u0, 16, z0), p(u0 + 8, 16, z0), p(u0 + 8, 19, z0 - 3), p(u0, 19, z0 - 3)], fill);
      polygon(ctx, [p(16, u0, z0), p(16, u0 + 8, z0), p(19, u0 + 8, z0 - 3), p(19, u0, z0 - 3)], fill);
    }
  }

  // Toit
  const roof = ROOF_COLORS[code];
  polygon(ctx, [p(-16, -16, heightPx), p(16, -16, heightPx), p(16, 16, heightPx), p(-16, 16, heightPx)], roof ? shade(roof, 1) : c.top);
  // Arêtes légères pour l'effet « bloc »
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(...p(16, 16, 0));
  ctx.lineTo(...p(16, 16, heightPx));
  ctx.stroke();

  textures.addCanvas(key, canvas);
  return key;
}

/** Décalage vertical de l'origine d'un bloc (pour `setOrigin`). */
export function buildingOriginY(levels: number): number {
  const h = TILE_H + levels * LEVEL_PX + 2;
  return (h - TILE_H / 2 - 1) / h;
}

// ---------- Objets du décor en relief ----------

export const PROP_DECOR = new Set<string>([DECOR.tree, DECOR.lamp, DECOR.bench]);
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
