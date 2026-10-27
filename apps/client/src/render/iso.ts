/** Projection isométrique et dessin de blocs « voxel » sur un canvas 2D. */

export const TILE_W = 64;
export const TILE_H = 32;
/** Hauteur d'un étage, en pixels écran. */
export const LEVEL_PX = 8;

/** Case (x, y) → centre du losange à l'écran. */
export function tileToScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Point écran → case (coordonnées fractionnaires ; arrondir pour la case). */
export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function shade(color: number, factor: number): string {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return `rgb(${r},${g},${b})`;
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

type P2 = [number, number];

export function polygon(ctx: CanvasRenderingContext2D, pts: P2[], fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * Projette un point 3D local (unités : 1 = 1 px de demi-largeur de case) vers l'écran,
 * depuis l'origine (ox, oy). +x va en bas à droite, +y en bas à gauche, +z vers le haut.
 */
export function project(ox: number, oy: number, x: number, y: number, z: number): P2 {
  return [ox + (x - y), oy + (x + y) / 2 - z];
}

export interface BoxColors {
  top: string;
  /** Face orientée +y (en bas à gauche). */
  left: string;
  /** Face orientée +x (en bas à droite). */
  right: string;
  stroke?: string;
}

export function boxColors(color: number): BoxColors {
  return { top: shade(color, 1.15), left: shade(color, 0.95), right: shade(color, 0.75), stroke: shade(color, 0.6) };
}

/** Dessine un pavé (x0..x1, y0..y1, z0..z1) avec ses 3 faces visibles. */
export function drawBox(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  b: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number },
  c: BoxColors,
): void {
  const p = (x: number, y: number, z: number) => project(ox, oy, x, y, z);
  // Face +y (gauche)
  polygon(ctx, [p(b.x0, b.y1, b.z0), p(b.x1, b.y1, b.z0), p(b.x1, b.y1, b.z1), p(b.x0, b.y1, b.z1)], c.left, c.stroke);
  // Face +x (droite)
  polygon(ctx, [p(b.x1, b.y0, b.z0), p(b.x1, b.y1, b.z0), p(b.x1, b.y1, b.z1), p(b.x1, b.y0, b.z1)], c.right, c.stroke);
  // Dessus
  polygon(ctx, [p(b.x0, b.y0, b.z1), p(b.x1, b.y0, b.z1), p(b.x1, b.y1, b.z1), p(b.x0, b.y1, b.z1)], c.top, c.stroke);
}

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}
