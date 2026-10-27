/**
 * Enfants qui jouent dans les cours d'école : ils courent, s'arrêtent, sautillent.
 * Purement décoratif (ce ne sont pas des personnages du jeu).
 */
import Phaser from 'phaser';
import { TILE, type CharacterLook, type MapGrid, type TilePoint } from '@jeu-ville/shared';
import { AVATAR_FEET_ORIGIN_Y, facingFromDir, renderAvatarCanvas } from '../render/avatar.js';
import { tileToScreen } from '../render/iso.js';

const KIDS_PER_YARD = 6;
const KID_SCALE = 0.32;
const WALK_SPEED = 1.4;
const RUN_SPEED = 3;

interface Kid {
  sprite: Phaser.GameObjects.Image;
  look: CharacterLook;
  x: number;
  y: number;
  target: TilePoint;
  speed: number;
  restUntil: number;
  yard: TilePoint[];
  phase: number;
}

export class SchoolKids {
  private readonly kids: Kid[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    grid: MapGrid,
  ) {
    for (const yard of findYards(grid)) {
      for (let k = 0; k < Math.min(KIDS_PER_YARD, yard.length); k++) {
        const start = yard[Math.floor(Math.random() * yard.length)]!;
        const look: CharacterLook = {
          sex: Math.random() < 0.5 ? 'male' : 'female',
          baseLook: Math.floor(Math.random() * 6),
          skinTone: Math.floor(Math.random() * 6),
          hairColor: Math.floor(Math.random() * 5),
          bodyType: 0,
        };
        const kid: Kid = {
          sprite: scene.add.image(0, 0, this.texture(look, 2)).setOrigin(0.5, AVATAR_FEET_ORIGIN_Y).setScale(KID_SCALE),
          look,
          x: start.x,
          y: start.y,
          target: start,
          speed: WALK_SPEED,
          restUntil: Math.random() * 3000,
          yard,
          phase: Math.random() * 1000,
        };
        this.kids.push(kid);
      }
    }
  }

  private texture(look: CharacterLook, dir: number): string {
    const facing = facingFromDir(dir);
    const key = `kid-${look.sex}-${look.baseLook}-${look.skinTone}-${look.hairColor}-${facing}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, renderAvatarCanvas(look, facing));
    return key;
  }

  update(time: number, delta: number): void {
    for (const kid of this.kids) {
      const dx = kid.target.x - kid.x;
      const dy = kid.target.y - kid.y;
      const dist = Math.hypot(dx, dy);
      let moving = false;
      if (dist > 0.05 && time >= kid.restUntil) {
        const step = Math.min(dist, (kid.speed * delta) / 1000);
        kid.x += (dx / dist) * step;
        kid.y += (dy / dist) * step;
        moving = true;
        const dir = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
        kid.sprite.setTexture(this.texture(kid.look, dir));
      } else if (dist <= 0.05) {
        // Nouvelle destination : on court ou on marche, après une petite pause.
        kid.target = kid.yard[Math.floor(Math.random() * kid.yard.length)]!;
        kid.speed = Math.random() < 0.6 ? RUN_SPEED : WALK_SPEED;
        kid.restUntil = time + 400 + Math.random() * 2500;
      }
      const p = tileToScreen(kid.x, kid.y);
      // Ça sautille, même à l'arrêt de temps en temps.
      const hop = moving || Math.sin((time + kid.phase) / 250) > 0.6 ? Math.abs(Math.sin((time + kid.phase) / 110)) * 3 : 0;
      kid.sprite.setPosition(p.x, p.y - hop).setDepth(kid.x + kid.y + 0.5);
    }
  }
}

/** Cours d'école : composantes connexes de cases TILE.yard. */
function findYards(grid: MapGrid): TilePoint[][] {
  const seen = new Set<string>();
  const yards: TilePoint[][] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.tileAt(x, y) !== TILE.yard || seen.has(`${x},${y}`)) continue;
      const yard: TilePoint[] = [];
      const stack: TilePoint[] = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length > 0) {
        const p = stack.pop()!;
        yard.push(p);
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = { x: p.x + ddx, y: p.y + ddy };
          if (grid.tileAt(n.x, n.y) === TILE.yard && !seen.has(`${n.x},${n.y}`)) {
            seen.add(`${n.x},${n.y}`);
            stack.push(n);
          }
        }
      }
      yards.push(yard);
    }
  }
  return yards;
}
