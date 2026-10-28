/** Personnages 3D animés (modèles Kenney « Mini Characters »). */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { CharacterLook } from '@jeu-ville/shared';
import { cloneModel, enableShadows, loadModel } from './assets.js';
import { groundTop } from './ground.js';

/** Taille « Sims » : bien plus grand qu'à l'échelle réelle, pour être lisible. */
const ADULT_HEIGHT = 0.8;
const SMOOTHING_PER_SECOND = 12;
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function modelForLook(look: Pick<CharacterLook, 'sex' | 'baseLook'>): string {
  return `character-${look.sex === 'female' ? 'female' : 'male'}-${LETTERS[look.baseLook % LETTERS.length]}`;
}

export class Character3D {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: string | null = null;
  private x: number;
  private y: number;
  private targetX: number;
  private targetY: number;
  private moving = false;
  private heading = 0;
  private label: CSS2DObject | null = null;
  private body: THREE.Object3D | null = null;
  private vehicle = '';
  private vehicleMesh: THREE.Object3D | null = null;

  constructor(
    private readonly groundAt: (x: number, y: number) => string,
    x: number,
    y: number,
    private readonly height = ADULT_HEIGHT,
  ) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.place();
  }

  /** `width` : multiplicateur de corpulence (voir BODY_TYPES). */
  async load(model: string, width = 1): Promise<void> {
    const gltf = await loadModel('characters', model);
    const body = cloneModel(gltf);
    const box = new THREE.Box3().setFromObject(body);
    const s = this.height / (box.max.y - box.min.y);
    body.scale.set(s * width, s, s * width);
    enableShadows(body, true, false);
    this.root.add(body);
    this.body = body;
    this.placeOnVehicle();
    this.mixer = new THREE.AnimationMixer(body);
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play(this.moving ? 'walk' : 'idle');
  }

  setLabel(text: string, self: boolean): void {
    if (!text) return;
    const el = document.createElement('div');
    el.className = `name-tag${self ? ' self' : ''}`;
    el.textContent = text;
    this.label = new CSS2DObject(el);
    this.label.position.set(0, this.height + 0.25, 0);
    this.root.add(this.label);
  }

  play(name: string, fade = 0.2): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().fadeIn(fade).play();
    prev?.fadeOut(fade);
    this.current = name;
  }

  /** Position cible (cases) et direction serveur (0→7, 0 = +x, sens horaire). */
  setTarget(x: number, y: number, moving: boolean, dir?: number): void {
    this.targetX = x;
    this.targetY = y;
    this.moving = moving;
    if (dir !== undefined && !moving) {
      const a = (dir * Math.PI) / 4;
      this.heading = Math.atan2(Math.cos(a), Math.sin(a));
    }
  }

  /** Monte sur un véhicule (« bike », « scooter ») ou en descend (''). */
  setVehicle(kind: string): void {
    if (kind === this.vehicle) return;
    this.vehicle = kind;
    this.vehicleMesh?.removeFromParent();
    this.vehicleMesh = kind === 'bike' ? bikeMesh() : kind === 'scooter' ? scooterMesh() : null;
    if (this.vehicleMesh) this.root.add(this.vehicleMesh);
    this.placeOnVehicle();
  }

  private placeOnVehicle(): void {
    if (!this.body) return;
    // Assis sur la selle, ou debout sur la planche.
    this.body.position.set(0, this.vehicle === 'bike' ? 0.17 : this.vehicle === 'scooter' ? 0.05 : 0, this.vehicle === 'bike' ? -0.05 : 0);
  }

  /** Pose le perso directement en (x, y), sans transition. */
  teleport(x: number, y: number): void {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.moving = false;
    this.place();
  }

  get isMoving(): boolean {
    return this.moving;
  }

  get tileX(): number {
    return this.x;
  }

  get tileY(): number {
    return this.y;
  }

  update(dt: number, walkAnim = 'walk'): void {
    const k = Math.min(1, SMOOTHING_PER_SECOND * dt);
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    this.x += dx * k;
    this.y += dy * k;
    if (Math.hypot(dx, dy) > 0.02) this.heading = Math.atan2(dx, dy);
    // À vélo : assis en permanence ; en trottinette : mains sur le guidon en roulant.
    const anim =
      this.vehicle === 'bike' ? 'drive' : this.vehicle === 'scooter' ? (this.moving ? 'holding-both' : 'idle') : this.moving ? walkAnim : 'idle';
    this.play(anim);
    this.mixer?.update(dt);
    this.place();
  }

  private place(): void {
    const top = this.groundTopAt(Math.round(this.x), Math.round(this.y));
    this.root.position.set(this.x, top, this.y);
    // Rotation douce vers la direction de marche.
    let delta = this.heading - this.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.root.rotation.y += delta * 0.25;
  }

  private groundTopAt(x: number, y: number): number {
    return groundTop(this.groundAt(x, y));
  }

  dispose(): void {
    this.label?.element.remove();
    this.root.removeFromParent();
  }
}

const METAL = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.5 });
const TIRE = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Vélo de ville, orienté selon +z comme les persos. */
function bikeMesh(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a9d8f, roughness: 0.5 });
  for (const z of [0.2, -0.2]) part(new THREE.TorusGeometry(0.11, 0.018, 6, 18).rotateY(Math.PI / 2), TIRE, 0, 0.12, z, g);
  part(new THREE.BoxGeometry(0.03, 0.03, 0.42), frame, 0, 0.2, 0, g);
  part(new THREE.BoxGeometry(0.03, 0.18, 0.03), frame, 0, 0.27, -0.06, g);
  part(new THREE.BoxGeometry(0.03, 0.2, 0.03), frame, 0, 0.27, 0.18, g);
  part(new THREE.BoxGeometry(0.07, 0.025, 0.11), METAL, 0, 0.37, -0.07, g); // selle
  part(new THREE.BoxGeometry(0.26, 0.02, 0.02), METAL, 0, 0.38, 0.19, g); // guidon
  return g;
}

/** Trottinette électrique : planche basse, colonne et guidon. */
function scooterMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.4 });
  for (const z of [0.18, -0.18]) part(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateZ(Math.PI / 2), TIRE, 0, 0.05, z, g);
  part(new THREE.BoxGeometry(0.1, 0.025, 0.36), body, 0, 0.07, 0, g);
  part(new THREE.BoxGeometry(0.025, 0.42, 0.025), METAL, 0, 0.28, 0.17, g);
  part(new THREE.BoxGeometry(0.24, 0.02, 0.02), METAL, 0, 0.48, 0.17, g);
  const light = new THREE.MeshStandardMaterial({ color: 0x9be7ff, emissive: 0x58c4ff, emissiveIntensity: 0.6 });
  part(new THREE.BoxGeometry(0.04, 0.02, 0.01), light, 0, 0.47, 0.185, g);
  return g;
}
