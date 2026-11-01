/**
 * Cache-cache : cachettes dessinées dans la ville (poubelles, voitures garées,
 * portes de hall et de cage d'escalier, rampes de parking souterrain), indices
 * sonores et champ de vision du chercheur.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HIDE_SEEK, HIDING_SPOT_LABELS, type HidingSpot, type TilePoint } from '@jeu-ville/shared';
import { cloneModel, enableShadows, loadModel } from './assets.js';
import { canvasTexture, signTexture } from './textures.js';

/** Les étiquettes des cachettes n'apparaissent qu'à moins de tant de cases du joueur. */
const TAG_RADIUS = 7;
/** Durée de l'animation de fouille (secondes). */
const SEARCH_ANIM_S = 0.8;
const CAR_MODELS = ['sedan', 'hatchback-sports', 'suv', 'van', 'taxi'];

interface SpotVisual {
  spot: HidingSpot;
  root: THREE.Group;
  tag: CSS2DObject;
  /** Fouille en cours d'animation (secondes écoulées), ou -1. */
  shake: number;
  base: THREE.Vector3;
}

export class HidingSpotLayer {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<string, SpotVisual>();
  private readonly hints: { ring: THREE.Mesh; tag: CSS2DObject; age: number }[] = [];
  private readonly sight: THREE.Mesh;
  private readonly selfRing: THREE.Mesh;
  private time = 0;

  constructor(
    spots: readonly HidingSpot[],
    private readonly groundAt: (x: number, y: number) => number,
  ) {
    for (const spot of spots) this.addSpot(spot);
    // Champ de vision du chercheur : disque léger autour de lui.
    this.sight = new THREE.Mesh(
      new THREE.CircleGeometry(HIDE_SEEK.sightRange, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.sight.visible = false;
    // Sa propre cachette : anneau vert pulsant.
    this.selfRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.selfRing.visible = false;
    this.group.add(this.sight, this.selfRing);
  }

  private addSpot(spot: HidingSpot): void {
    const root = new THREE.Group();
    const facing = { x: spot.access.x - spot.x, y: spot.access.y - spot.y };
    let tagHeight = 0.9;
    if (spot.kind === 'trash') root.add(trashBin());
    else if (spot.kind === 'parking') root.add(parkingRamp());
    else if (spot.kind === 'car') {
      tagHeight = 0.8;
      void loadModel('cars', CAR_MODELS[(spot.x * 7 + spot.y * 3) % CAR_MODELS.length]!).then((gltf) => {
        const model = cloneModel(gltf);
        const box = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(0.85 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
        enableShadows(model);
        root.add(model);
      });
    } else {
      tagHeight = 1;
      root.add(buildingDoor(spot.kind === 'hall'));
    }
    const base = new THREE.Vector3(spot.x, this.groundAt(spot.x, spot.y), spot.y);
    if (spot.kind === 'hall' || spot.kind === 'stairwell') {
      // Porte plaquée sur la façade, côté rue.
      base.set(spot.x + facing.x * 0.52, this.groundAt(spot.access.x, spot.access.y), spot.y + facing.y * 0.52);
      root.rotation.y = Math.atan2(facing.x, facing.y);
    } else if (spot.kind === 'car') {
      root.rotation.y = spot.axis === 'x' ? Math.PI / 2 : 0;
    } else {
      root.rotation.y = Math.atan2(facing.x, facing.y);
    }
    root.position.copy(base);
    const el = document.createElement('div');
    el.className = 'spot-tag';
    el.textContent = HIDING_SPOT_LABELS[spot.kind].icon;
    const tag = new CSS2DObject(el);
    tag.position.set(base.x, base.y + tagHeight, base.z);
    tag.visible = false;
    this.group.add(root, tag);
    this.visuals.set(spot.id, { spot, root, tag, shake: -1, base });
  }

  /** Hauteur visée pour toucher une cachette à l'écran. */
  pickables(): { id: string; x: number; y: number; h: number }[] {
    return [...this.visuals.values()].map((v) => ({ id: v.spot.id, x: v.base.x, y: v.base.z, h: v.base.y + 0.35 }));
  }

  /** Une cachette vient d'être fouillée : elle tremble, et l'on montre si quelqu'un y était. */
  searched(spotId: string, found: boolean): void {
    const v = this.visuals.get(spotId);
    if (!v) return;
    v.shake = 0;
    const el = v.tag.element;
    el.textContent = found ? '😱' : '🔍';
    el.classList.add('flash');
    window.setTimeout(() => {
      el.classList.remove('flash');
      el.textContent = HIDING_SPOT_LABELS[v.spot.kind].icon;
    }, 1500);
  }

  /** Indice sonore : cercle qui pulse là où le bruit a été entendu. */
  hint(at: TilePoint, radius: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.25, radius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    const y = this.groundAt(at.x, at.y) + 0.04;
    ring.position.set(at.x, y, at.y);
    const el = document.createElement('div');
    el.className = 'hint-tag';
    el.textContent = '🔊 Un bruit par ici !';
    const tag = new CSS2DObject(el);
    tag.position.set(at.x, y + 1.6, at.y);
    this.group.add(ring, tag);
    this.hints.push({ ring, tag, age: 0 });
  }

  /** Cachettes occupées vues par les coéquipiers et les spectateurs (nom de qui s'y cache). */
  setOccupants(occupants: Map<string, string>, selfSpot: string | null): void {
    for (const v of this.visuals.values()) {
      const who = occupants.get(v.spot.id);
      const el = v.tag.element;
      if (el.classList.contains('flash')) continue;
      el.classList.toggle('occupied', !!who);
      el.classList.toggle('mine', v.spot.id === selfSpot);
      el.textContent = v.spot.id === selfSpot ? '🙈 Tu es caché ici' : who ? `🙈 ${who}` : HIDING_SPOT_LABELS[v.spot.kind].icon;
    }
    const mine = selfSpot ? this.visuals.get(selfSpot) : undefined;
    this.selfRing.visible = !!mine;
    if (mine) this.selfRing.position.set(mine.base.x, mine.base.y + 0.03, mine.base.z);
  }

  /** Champ de vision autour du chercheur local (null : pas chercheur). */
  setSight(at: TilePoint | null): void {
    this.sight.visible = !!at;
    if (at) this.sight.position.set(at.x, this.groundAt(at.x, at.y) + 0.02, at.y);
  }

  update(dt: number, self: TilePoint | null): void {
    this.time += dt;
    for (const v of this.visuals.values()) {
      const near = !!self && Math.hypot(v.base.x - self.x, v.base.z - self.y) <= TAG_RADIUS;
      v.tag.visible = near || v.tag.element.classList.contains('occupied') || v.tag.element.classList.contains('flash');
      if (v.shake >= 0) {
        v.shake += dt;
        const k = Math.max(0, 1 - v.shake / SEARCH_ANIM_S);
        v.root.position.set(v.base.x + Math.sin(v.shake * 50) * 0.06 * k, v.base.y, v.base.z);
        if (v.shake >= SEARCH_ANIM_S) {
          v.shake = -1;
          v.root.position.copy(v.base);
        }
      }
    }
    const pulse = (Math.sin(this.time * 5) + 1) / 2;
    this.selfRing.scale.setScalar(0.9 + 0.2 * pulse);
    const life = HIDE_SEEK.hints.visibleMs / 1000;
    for (const h of this.hints) {
      h.age += dt;
      const mat = h.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * Math.max(0, 1 - h.age / life) * (0.6 + 0.4 * pulse);
      h.ring.scale.setScalar(0.85 + 0.15 * ((h.age * 1.5) % 1));
    }
    for (let k = this.hints.length - 1; k >= 0; k--) {
      const h = this.hints[k]!;
      if (h.age < life) continue;
      h.ring.removeFromParent();
      h.tag.removeFromParent();
      h.tag.element.remove();
      this.hints.splice(k, 1);
    }
  }
}

/** Grand conteneur vert à roulettes. */
function trashBin(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.38), new THREE.MeshStandardMaterial({ color: 0x3d9a4f, roughness: 0.7 }));
  body.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.42), new THREE.MeshStandardMaterial({ color: 0x2b6e39 }));
  lid.position.y = 0.58;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x24302a }));
  handle.position.set(0, 0.52, -0.21);
  const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12).rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22 });
  for (const dx of [-0.17, 0.17]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(dx, 0.06, -0.15);
    g.add(w);
  }
  g.add(body, lid, handle);
  enableShadows(g);
  return g;
}

/** Porte d'immeuble : vitrée pour un hall, pleine pour une cage d'escalier. */
function buildingDoor(hall: boolean): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.04), new THREE.MeshStandardMaterial({ color: 0x3a4048 }));
  frame.position.y = 0.31;
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.56, 0.05),
    new THREE.MeshStandardMaterial(hall ? { color: 0x9fd3e8, transparent: true, opacity: 0.85, roughness: 0.2 } : { color: 0x8a5a3c, roughness: 0.8 }),
  );
  leaf.position.set(0, 0.29, 0.01);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.12),
    new THREE.MeshStandardMaterial({ map: signTexture(hall ? 'HALL' : 'ESCALIER', hall ? '#1d3557' : '#6d4c41', '#ffffff') }),
  );
  sign.position.set(0, 0.7, 0.03);
  g.add(frame, leaf, sign);
  enableShadows(g);
  return g;
}

/** Entrée de parking souterrain : rampe sombre, barrière et panneau « P ». */
function parkingRamp(): THREE.Group {
  const g = new THREE.Group();
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), new THREE.MeshStandardMaterial({ color: 0x2d3136, roughness: 0.9 }));
  ramp.rotation.x = -0.18;
  ramp.position.y = 0.02;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb7b1a4 });
  for (const dx of [-0.47, 0.47]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.9), wallMat);
    wall.position.set(dx, 0.11, 0);
    g.add(wall);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.35), wallMat);
  roof.position.set(0, 0.42, -0.3);
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0xe63946 }));
  barrier.position.set(0, 0.3, 0.38);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x5b6470 }));
  post.position.set(0.52, 0.4, 0.42);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.03), new THREE.MeshStandardMaterial({ map: parkingSign() }));
  panel.position.set(0.52, 0.85, 0.42);
  g.add(ramp, roof, barrier, post, panel);
  enableShadows(g);
  return g;
}

/** Panneau carré « P » bleu. */
function parkingSign(): THREE.Texture {
  return canvasTexture(64, 64, (c) => {
    c.fillStyle = '#1d4ed8';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#ffffff';
    c.font = 'bold 48px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('P', 32, 35);
  });
}
