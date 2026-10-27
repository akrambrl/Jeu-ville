import Phaser from 'phaser';
import type { CharacterLook } from '@jeu-ville/shared';
import { AVATAR_FEET_ORIGIN_Y, facingFromDir, renderAvatarCanvas, type Facing } from '../render/avatar.js';
import { tileToScreen } from '../render/iso.js';

/** Vitesse de rattrapage de la position serveur (plus haut = plus nerveux). */
const SMOOTHING_PER_SECOND = 12;

function textureKey(look: CharacterLook, facing: Facing): string {
  return `av-${look.sex}-${look.baseLook}-${look.skinTone}-${look.hairColor}-${look.bodyType}-${facing}`;
}

/** Personnage affiché : interpole vers la position envoyée par le serveur. */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private x: number;
  private y: number;
  private targetX: number;
  private targetY: number;
  private dir = 2;
  private moving = false;
  private walkTime = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly look: CharacterLook,
    name: string,
    x: number,
    y: number,
    isSelf: boolean,
  ) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.sprite = scene.add.image(0, 0, this.ensureTexture(facingFromDir(this.dir)));
    this.sprite.setOrigin(0.5, AVATAR_FEET_ORIGIN_Y).setScale(0.5);
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: isSelf ? '#fff7d6' : '#ffffff',
        backgroundColor: isSelf ? 'rgba(30,90,80,0.8)' : 'rgba(20,20,30,0.55)',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
    this.place();
  }

  private ensureTexture(facing: Facing): string {
    const key = textureKey(this.look, facing);
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, renderAvatarCanvas(this.look, facing));
    return key;
  }

  setServerState(x: number, y: number, dir: number, moving: boolean): void {
    this.targetX = x;
    this.targetY = y;
    this.moving = moving;
    if (dir !== this.dir) {
      this.dir = dir;
      this.sprite.setTexture(this.ensureTexture(facingFromDir(dir)));
    }
  }

  get tileX(): number {
    return this.x;
  }

  get tileY(): number {
    return this.y;
  }

  update(dtMs: number): void {
    const k = Math.min(1, (SMOOTHING_PER_SECOND * dtMs) / 1000);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    this.walkTime = this.moving ? this.walkTime + dtMs : 0;
    this.place();
  }

  private place(): void {
    const p = tileToScreen(this.x, this.y);
    const bob = this.moving ? -Math.abs(Math.sin(this.walkTime / 90)) * 2 : 0;
    this.sprite.setPosition(p.x, p.y + bob);
    // Devant les blocs de sa case et de celles « derrière » lui.
    this.sprite.setDepth(this.x + this.y + 0.5);
    this.label.setPosition(p.x, p.y - 34);
    this.label.setDepth(1e6);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
