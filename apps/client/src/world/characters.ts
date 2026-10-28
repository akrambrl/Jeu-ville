/** Personnages 3D animés (voir people.ts pour les modèles). */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { enableShadows } from './assets.js';
import { groundTop } from './ground.js';
import { loadPerson, type PersonLook } from './people.js';

/** Taille « Sims » : bien plus grand qu'à l'échelle réelle, pour être lisible. */
const ADULT_HEIGHT = 0.8;
const SMOOTHING_PER_SECOND = 12;
/** En dessous de cette taille, c'est un enfant : tête plus grosse. */
const CHILD_HEIGHT = 0.6;
const CHILD_HEAD_SCALE = 1.35;
/** Vélo à la taille des persos adultes ; selle (hauteur, recul) mise à l'échelle. */
const BIKE_SCALE = 1.3;
const BIKE_SEAT = { y: 0.385 * BIKE_SCALE, z: -0.07 * BIKE_SCALE };
const SCOOTER_DECK = 0.085;
/** Durée d'affichage d'une bulle de parole (ms). */
const BUBBLE_MS = 6000;
/** Hauteur de la bulle au-dessus de la tête (cases), au-dessus du nom et des étiquettes. */
const BUBBLE_LIFT = 0.9;

/** Rotation d'un os autour de l'axe gauche-droite du corps (degrés, + = vers l'arrière). */
type Pose = Record<string, number>;
const BIKE_POSE: Pose = {
  UpperLegL: -80,
  UpperLegR: -70,
  LowerLegL: 70,
  LowerLegR: 85,
  UpperArmL: -45,
  UpperArmR: -45,
  LowerArmL: -25,
  LowerArmR: -25,
};
const SCOOTER_POSE: Pose = { UpperArmL: -40, UpperArmR: -40, LowerArmL: -30, LowerArmR: -30 };
const FEET = [
  ['FootL', 'LowerLegL'],
  ['FootR', 'LowerLegR'],
] as const;

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
  /** Os du squelette (noms glTF sans points, ex. « UpperLegL ») et leur pose de repos. */
  private bones = new Map<string, { bone: THREE.Object3D; rest: THREE.Quaternion }>();
  /** Pieds (os rattachés à la racine) : position par rapport au tibia au repos. */
  private feet: { foot: THREE.Object3D; shin: THREE.Object3D; offset: THREE.Vector3; turn: THREE.Quaternion; rest: THREE.Vector3 }[] = [];
  private hipHeight = 0;
  /** Décalage vertical pour poser les pieds au sol. */
  private groundOffset = 0;
  /** Une pose a été appliquée à la dernière image (à défaire avant l'animation). */
  private posed = false;

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
  async load(look: PersonLook, width = 1): Promise<void> {
    const { body, clips } = await loadPerson(look);
    if (this.height < CHILD_HEIGHT) body.getObjectByName('Head')?.scale.setScalar(CHILD_HEAD_SCALE);
    body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body);
    const s = this.height / (box.max.y - box.min.y);
    body.scale.set(s * width, s, s * width);
    this.groundOffset = -box.min.y * s;
    body.position.y = this.groundOffset;
    enableShadows(body, true, false);
    this.root.add(body);
    this.body = body;
    body.updateMatrixWorld(true);
    body.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, { bone: o, rest: o.quaternion.clone() });
    });
    const hips = body.getObjectByName('Hips');
    this.hipHeight = hips ? this.root.worldToLocal(hips.getWorldPosition(new THREE.Vector3())).y : this.height / 2;
    for (const [footName, shinName] of FEET) {
      const foot = body.getObjectByName(footName);
      const shin = body.getObjectByName(shinName);
      if (!foot || !shin) continue;
      const offset = shin.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
      const turn = shin.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
      this.feet.push({ foot, shin, offset, turn, rest: foot.position.clone() });
    }
    this.placeOnVehicle();
    this.mixer = new THREE.AnimationMixer(body);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play(this.moving ? 'walk' : 'idle');
  }

  private bubble: CSS2DObject | null = null;
  private bubbleTimer = 0;

  /** Bulle de parole au-dessus de la tête, quelques secondes. */
  say(text: string, ms = BUBBLE_MS): void {
    this.bubble?.element.remove();
    this.bubble?.removeFromParent();
    window.clearTimeout(this.bubbleTimer);
    const el = document.createElement('div');
    el.className = 'speech-bubble';
    el.textContent = text;
    this.bubble = new CSS2DObject(el);
    // Ancrée par le bas : la bulle grandit vers le haut, au-dessus du nom.
    this.bubble.center.set(0.5, 1);
    this.bubble.position.set(0, this.height + BUBBLE_LIFT, 0);
    this.root.add(this.bubble);
    this.bubbleTimer = window.setTimeout(() => {
      this.bubble?.element.remove();
      this.bubble?.removeFromParent();
      this.bubble = null;
    }, ms);
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
    // Assis sur la selle (les hanches dessus), ou debout sur la planche.
    const lift = this.vehicle === 'bike' ? BIKE_SEAT.y - this.hipHeight : this.vehicle === 'scooter' ? SCOOTER_DECK : 0;
    this.body.position.set(0, this.groundOffset + lift, this.vehicle === 'bike' ? BIKE_SEAT.z : 0);
  }

  /** Remet au repos les os qu'une pose a pu tourner (avant que les animations ne s'appliquent). */
  private resetPose(): void {
    for (const { bone, rest } of this.bones.values()) bone.quaternion.copy(rest);
    for (const f of this.feet) f.foot.position.copy(f.rest);
  }

  /** Pose (vélo, trottinette) appliquée par-dessus l'animation en cours. */
  private applyPose(pose: Pose): void {
    const body = this.body!;
    body.updateMatrixWorld(true);
    const bodyQ = body.getWorldQuaternion(new THREE.Quaternion());
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQ);
    for (const [name, degrees] of Object.entries(pose)) {
      const bone = this.bones.get(name)?.bone;
      if (!bone?.parent) continue;
      // Rotation autour de l'axe du corps, ramenée dans le repère du parent.
      const turn = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees));
      const world = turn.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(parentQ.invert().multiply(world));
      bone.updateMatrixWorld(true);
    }
    // Les pieds ne sont pas enfants des tibias : on les recolle au bout des jambes.
    for (const f of this.feet) {
      const parent = f.foot.parent!;
      const world = f.shin.localToWorld(f.offset.clone());
      f.foot.position.copy(parent.worldToLocal(world));
      const q = f.shin.getWorldQuaternion(new THREE.Quaternion()).multiply(f.turn);
      f.foot.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
    }
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
    // À vélo ou en trottinette : pose fixe (assis / mains sur le guidon) sur l'animation de repos.
    this.play(this.vehicle || !this.moving ? 'idle' : walkAnim);
    if (this.body) {
      if (this.posed) this.resetPose();
      this.mixer?.update(dt);
      const pose = this.vehicle === 'bike' ? BIKE_POSE : this.vehicle === 'scooter' ? SCOOTER_POSE : null;
      if (pose) this.applyPose(pose);
      this.posed = pose !== null;
    }
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
    window.clearTimeout(this.bubbleTimer);
    this.bubble?.element.remove();
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
  g.scale.setScalar(BIKE_SCALE);
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
