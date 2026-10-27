/**
 * Dessin des personnages en petits blocs. Utilisé à la fois pour l'aperçu de
 * création (canvas DOM) et pour les textures Phaser.
 */
import { BASE_LOOKS, BODY_TYPES, HAIR_COLORS, SKIN_TONES, type CharacterLook } from '@jeu-ville/shared';
import { boxColors, drawBox, makeCanvas, project, shade } from './iso.js';

/** Orientation affichée : yeux sur la face +x, +y, les deux, ou de dos. */
export type Facing = 'x' | 'y' | 'xy' | 'back';

/** Direction serveur (0→7) → orientation de dessin. */
export function facingFromDir(dir: number): Facing {
  switch (dir) {
    case 0:
    case 7:
      return 'x';
    case 1:
      return 'xy';
    case 2:
    case 3:
      return 'y';
    default:
      return 'back';
  }
}

export const AVATAR_W = 40;
export const AVATAR_H = 60;
const PANTS = 0x2d3142;
const SHOES = 0x1d1d22;

/** Dessine l'avatar ; (ox, oy) = position des pieds. `s` = échelle. */
export function drawAvatar(ctx: CanvasRenderingContext2D, look: CharacterLook, facing: Facing, ox: number, oy: number, s: number): void {
  const base = BASE_LOOKS[look.baseLook] ?? BASE_LOOKS[0];
  const skin = SKIN_TONES[look.skinTone] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const widthMul = (BODY_TYPES[look.bodyType] ?? BODY_TYPES[1]).width;
  const female = look.sex === 'female';

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) =>
    drawBox(ctx, 0, 0, { x0, y0, z0, x1, y1, z1 }, { ...boxColors(color), stroke: shade(color, 0.55) });

  // Ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bw = 5 * widthMul; // demi-largeur du torse
  // Jambes
  box(-3.5, -1.5, 0, -0.5, 1.5, 2, SHOES);
  box(0.5, -1.5, 0, 3.5, 1.5, 2, SHOES);
  box(-3.5, -1.5, 2, -0.5, 1.5, 11, female && look.baseLook === 4 ? base.outfitColor : PANTS);
  box(0.5, -1.5, 2, 3.5, 1.5, 11, female && look.baseLook === 4 ? base.outfitColor : PANTS);
  // Bras arrière, torse, puis bras avant (ordre du peintre : du fond vers l'avant).
  box(-bw - 2.5, -1.5, 11, -bw, 1.5, 13, skin);
  box(-bw - 2.5, -1.5, 13, -bw, 1.5, 21, base.outfitColor);
  box(-bw, -2.5, 11, bw, 2.5, 22, base.outfitColor);
  box(bw, -1.5, 11, bw + 2.5, 1.5, 13, skin);
  box(bw, -1.5, 13, bw + 2.5, 1.5, 21, base.outfitColor);

  const style = base.hairStyle;
  if (style === 'long' || female) {
    // Mèches sur la nuque, dessinées AVANT la tête car elles sont derrière.
    box(-4.8, -4.8, 21, 4.8, -3.6, 30, hair);
    box(-4.8, -4.8, 21, -3.6, 4.8, 30, hair);
  }

  // Tête
  const head = { x0: -4.5, y0: -4.5, z0: 22, x1: 4.5, y1: 4.5, z1: 31 };
  box(head.x0, head.y0, head.z0, head.x1, head.y1, head.z1, facing === 'back' ? hair : skin);

  // Visage
  if (facing !== 'back') {
    ctx.fillStyle = '#1b1b1f';
    const eye = (pt: [number, number]) => ctx.fillRect(pt[0] - 0.7, pt[1] - 1, 1.4, 2);
    if (facing === 'x' || facing === 'xy') {
      eye(project(0, 0, head.x1, -1.8, 27));
      eye(project(0, 0, head.x1, 1.8, 27));
    }
    if (facing === 'y' || facing === 'xy') {
      eye(project(0, 0, -1.8, head.y1, 27));
      eye(project(0, 0, 1.8, head.y1, 27));
    }
  }

  // Cheveux selon le style
  const capTop = style === 'buzz' ? 31.6 : style === 'curly' ? 34 : 32.5;
  box(-4.8, -4.8, 29, 4.8, 4.8, capTop, hair);
  if (style === 'side') box(-4.8, -4.8, 26, -2, 4.8, 30, hair);
  if (style === 'bun') box(-2, -2, capTop, 2, 2, capTop + 3.5, hair);
  ctx.restore();
}

/** Canvas d'avatar prêt à être converti en texture (échelle 2 pour la netteté). */
export function renderAvatarCanvas(look: CharacterLook, facing: Facing, scale = 2): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(AVATAR_W * scale, AVATAR_H * scale);
  drawAvatar(ctx, look, facing, (AVATAR_W / 2) * scale, (AVATAR_H - 6) * scale, scale);
  return canvas;
}

/** Fraction verticale des pieds dans la texture (pour `setOrigin`). */
export const AVATAR_FEET_ORIGIN_Y = (AVATAR_H - 6) / AVATAR_H;
