/** Génère les textures de la ville (sol + blocs d'immeubles) sans asset externe. */
import Phaser from 'phaser';
import { TILE } from '@jeu-ville/shared';
import { BUILDING_COLORS, GROUND_COLORS, ROOF_COLORS, WINDOW_COLOR } from './palette.js';
import { LEVEL_PX, TILE_H, TILE_W, boxColors, makeCanvas, polygon, project, shade } from './iso.js';

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

function drawGroundTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, code: string): void {
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
  ctx.restore();
}

/** Atlas des sols : une frame par code de case. */
export function createGroundTextures(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(GROUND_TEXTURE)) return;
  const codes = Object.keys(GROUND_COLORS);
  const fw = TILE_W + 2;
  const fh = TILE_H + 2;
  const { canvas, ctx } = makeCanvas(fw * codes.length, fh);
  codes.forEach((code, i) => drawGroundTile(ctx, i * fw + fw / 2, fh / 2, code));
  const tex = textures.addCanvas(GROUND_TEXTURE, canvas)!;
  codes.forEach((code, i) => tex.add(code, 0, i * fw, 0, fw, fh));

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
