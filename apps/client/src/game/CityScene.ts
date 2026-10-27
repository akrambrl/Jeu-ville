import Phaser from 'phaser';
import { BUILDING_TILES, MapGrid, type CharacterLook, type DistrictMap, type TilePoint } from '@jeu-ville/shared';
import type { DistrictLink, PlayerView } from '../net/link.js';
import {
  GROUND_TEXTURE,
  MARKER_TEXTURE,
  PROP_DECOR,
  PROP_ORIGIN_Y,
  buildingOriginY,
  createGroundTextures,
  ensureBuildingTexture,
  ensurePropTexture,
  groundFrame,
} from '../render/cityTextures.js';
import { LEVEL_PX, TILE_H, TILE_W, screenToTile, tileToScreen } from '../render/iso.js';
import { BACKGROUND_COLOR } from '../render/palette.js';
import { Avatar } from './Avatar.js';

export interface CitySceneData {
  map: DistrictMap;
  link: DistrictLink;
  homeDoor: TilePoint | null;
  /** Appelé à chaque image avec la position affichée du joueur local. */
  onLocalPosition: (x: number, y: number) => void;
}

const DRAG_THRESHOLD_PX = 8;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const POI_LABELS = new Set(['townhall', 'station', 'park', 'worship', 'market', 'school']);

export class CityScene extends Phaser.Scene {
  private ctx!: CitySceneData;
  private grid!: MapGrid;
  private readonly avatars = new Map<string, Avatar>();
  private marker!: Phaser.GameObjects.Image;
  private drag: { startX: number; startY: number; scrollX: number; scrollY: number; active: boolean } | null = null;
  private pinch: { distance: number; zoom: number } | null = null;
  private following = true;

  constructor() {
    super('city');
  }

  init(data: CitySceneData): void {
    this.ctx = data;
    this.grid = new MapGrid(data.map);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);
    createGroundTextures(this.textures);
    this.buildGround();
    this.buildBuildings();
    this.buildProps();
    this.buildStreetNames();
    this.buildLabels();
    this.buildHomeMarker();

    this.marker = this.add.image(0, 0, MARKER_TEXTURE).setDepth(-0.5).setVisible(false);
    this.setupCamera();
    this.setupInput();
    this.bindPlayers();
  }

  override update(_time: number, delta: number): void {
    for (const a of this.avatars.values()) a.update(delta);
    const self = this.avatars.get(this.ctx.link.sessionId);
    if (self) {
      this.ctx.onLocalPosition(self.tileX, self.tileY);
      if (this.following) {
        const cam = this.cameras.main;
        const target = tileToScreen(self.tileX, self.tileY);
        cam.scrollX += (target.x - cam.width / 2 - cam.scrollX) * 0.12;
        cam.scrollY += (target.y - cam.height / 2 - cam.scrollY) * 0.12;
      }
    }
  }

  /** Recentre la caméra sur le joueur (bouton du HUD). */
  recenter(): void {
    this.following = true;
  }

  /** Demande au serveur d'aller vers une case. */
  requestMove(to: TilePoint): void {
    this.ctx.link.move(to);
    const p = tileToScreen(to.x, to.y);
    this.marker.setPosition(p.x, p.y).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.marker);
    this.tweens.add({ targets: this.marker, alpha: 0, delay: 600, duration: 500 });
    this.following = true;
  }

  // ---------- Construction de la ville ----------

  private buildGround(): void {
    const { map } = this.ctx;
    const blitter = this.add.blitter(0, 0, GROUND_TEXTURE).setDepth(-1);
    const fw = TILE_W + 2;
    const fh = TILE_H + 2;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const code = this.grid.tileAt(x, y);
        // Sous les bâtiments : trottoir.
        const frame = BUILDING_TILES.has(code) ? 'P' : groundFrame(code, this.grid.decorAt(x, y));
        const p = tileToScreen(x, y);
        blitter.create(p.x - fw / 2, p.y - fh / 2, frame);
      }
    }
  }

  private buildBuildings(): void {
    const { map } = this.ctx;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const code = this.grid.tileAt(x, y);
        if (!BUILDING_TILES.has(code)) continue;
        const levels = Math.max(1, this.grid.levelsAt(x, y));
        const key = ensureBuildingTexture(this.textures, code, levels);
        const p = tileToScreen(x, y);
        this.add.image(p.x, p.y, key).setOrigin(0.5, buildingOriginY(levels)).setDepth(x + y);
      }
    }
  }

  /** Arbres, lampadaires, bancs. */
  private buildProps(): void {
    const { map } = this.ctx;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const decor = this.grid.decorAt(x, y);
        if (!PROP_DECOR.has(decor)) continue;
        const key = ensurePropTexture(this.textures, decor, (x * 7 + y * 13) % 4);
        const p = tileToScreen(x, y);
        this.add.image(p.x, p.y, key).setOrigin(0.5, PROP_ORIGIN_Y).setDepth(x + y + 0.3);
      }
    }
  }

  /** Noms des rues écrits sur la chaussée, dans le sens de la rue. */
  private buildStreetNames(): void {
    const angle = Math.atan2(TILE_H / 2, TILE_W / 2);
    for (const s of this.ctx.map.streets) {
      const p = tileToScreen(s.x, s.y);
      this.add
        .text(p.x, p.y, s.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: 'rgba(255,255,255,0.75)',
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setRotation(s.axis === 'x' ? angle : -angle)
        .setDepth(-0.6);
    }
  }

  private buildLabels(): void {
    for (const poi of this.ctx.map.pois) {
      if (!POI_LABELS.has(poi.kind)) continue;
      const p = tileToScreen(poi.x, poi.y);
      const levels = this.grid.levelsAt(poi.x, poi.y);
      this.add
        .text(p.x, p.y - levels * LEVEL_PX - 18, poi.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: poi.kind === 'townhall' ? '13px' : '11px',
          fontStyle: poi.kind === 'townhall' ? 'bold' : 'normal',
          color: '#22313f',
          backgroundColor: 'rgba(255,255,255,0.78)',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(1e6 - 1);
    }
  }

  private buildHomeMarker(): void {
    const door = this.ctx.homeDoor;
    if (!door) return;
    const p = tileToScreen(door.x, door.y);
    const label = this.add
      .text(p.x, p.y - 56, '🏠 Chez moi', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(28,120,104,0.92)',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2)
      .setDepth(1e6);
    this.tweens.add({ targets: label, y: p.y - 62, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
  }

  // ---------- Caméra et contrôles ----------

  private setupCamera(): void {
    const { map } = this.ctx;
    const left = tileToScreen(0, map.height).x - TILE_W;
    const right = tileToScreen(map.width, 0).x + TILE_W;
    const top = -9 * LEVEL_PX - TILE_H * 2;
    const bottom = tileToScreen(map.width, map.height).y + TILE_H;
    const cam = this.cameras.main;
    cam.setBounds(left, top, right - left, bottom - top);
    cam.setZoom(this.scale.width < 700 ? 0.8 : 1);
    const start = this.ctx.homeDoor ?? map.spawn;
    const p = tileToScreen(start.x, start.y);
    cam.centerOn(p.x, p.y);
  }

  private setupInput(): void {
    this.input.addPointer(1);
    const cam = this.cameras.main;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPinching()) return this.startPinch();
      this.drag = { startX: pointer.x, startY: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY, active: false };
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pinch && this.isPinching()) {
        const d = this.pointerDistance();
        cam.setZoom(Phaser.Math.Clamp((this.pinch.zoom * d) / this.pinch.distance, MIN_ZOOM, MAX_ZOOM));
        return;
      }
      if (!this.drag || !pointer.isDown) return;
      const dx = pointer.x - this.drag.startX;
      const dy = pointer.y - this.drag.startY;
      if (!this.drag.active && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        this.drag.active = true;
        this.following = false;
      }
      if (this.drag.active) {
        cam.scrollX = this.drag.scrollX - dx / cam.zoom;
        cam.scrollY = this.drag.scrollY - dy / cam.zoom;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.pinch) {
        if (!this.isPinching()) this.pinch = null;
        this.drag = null;
        return;
      }
      if (this.drag && !this.drag.active) {
        const world = cam.getWorldPoint(pointer.x, pointer.y);
        const t = screenToTile(world.x, world.y);
        const tile = { x: Math.round(t.x), y: Math.round(t.y) };
        if (this.grid.isWalkable(tile.x, tile.y)) this.requestMove(tile);
      }
      this.drag = null;
    });

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM));
    });
  }

  private isPinching(): boolean {
    return this.input.pointer1.isDown && this.input.pointer2.isDown;
  }

  private pointerDistance(): number {
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  private startPinch(): void {
    this.drag = null;
    this.pinch = { distance: this.pointerDistance(), zoom: this.cameras.main.zoom };
  }

  // ---------- Synchronisation avec le serveur ----------

  private bindPlayers(): void {
    const link = this.ctx.link;
    link.subscribePlayers({
      added: (id, p) => {
        const avatar = new Avatar(this, lookOf(p), p.name, p.x, p.y, id === link.sessionId);
        this.avatars.set(id, avatar);
      },
      changed: (id, p) => this.avatars.get(id)?.setServerState(p.x, p.y, p.dir, p.moving),
      removed: (id) => {
        this.avatars.get(id)?.destroy();
        this.avatars.delete(id);
      },
    });
  }
}

function lookOf(p: PlayerView): CharacterLook {
  return {
    sex: p.sex === 'female' ? 'female' : 'male',
    baseLook: p.baseLook,
    skinTone: p.skinTone,
    hairColor: p.hairColor,
    bodyType: p.bodyType,
  };
}
