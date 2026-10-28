/**
 * Animaux de compagnie en 3D (chien, chat), modelés en volumes simples dans le
 * style des persos Kenney. Ils suivent leur maître, pattes et queue animées.
 */
import * as THREE from 'three';

/** Robes par espèce (index = numéro de robe dans « dog:2 »). */
const COATS: Record<string, [number, number][]> = {
  // [pelage, oreilles/taches]
  dog: [
    [0x9a6a3c, 0x5e3b1e],
    [0x2b2b2e, 0x161618],
    [0xe8dcc4, 0xb08a5a],
    [0x8d8f94, 0x5b5d62],
  ],
  cat: [
    [0xe08a3c, 0xb35f1e],
    [0x2b2b2e, 0x161618],
    [0xf2efe8, 0x9a9a9a],
    [0x8d8f94, 0x5b5d62],
  ],
};
/** Distance (cases) à laquelle l'animal se tient derrière son maître. */
const FOLLOW_DISTANCE = 0.5;
const FOLLOW_SIDE = 0.4;
/** Un peu plus gros que nature, pour bien le voir à côté des persos. */
const PET_SCALE = 1.3;

export class Pet3D {
  readonly root = new THREE.Group();
  private readonly legs: THREE.Object3D[] = [];
  private readonly tail: THREE.Object3D;
  private phase = Math.random() * 10;

  constructor(readonly look: string) {
    const [species = 'dog', coatIndex = '0'] = look.split(':');
    const coats = COATS[species] ?? COATS.dog!;
    const [fur, dark] = coats[Number(coatIndex) % coats.length]!;
    const furMat = new THREE.MeshStandardMaterial({ color: fur, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const cat = species === 'cat';
    const s = cat ? 0.8 : 1;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Corps orienté selon +z (comme les persos).
    add(new THREE.BoxGeometry(0.16 * s, 0.13 * s, 0.32 * s), furMat, 0, 0.17 * s, 0);
    const head = add(new THREE.BoxGeometry(0.15 * s, 0.14 * s, 0.14 * s), furMat, 0, 0.27 * s, 0.19 * s);
    if (cat) {
      for (const x of [-0.045, 0.045]) add(new THREE.ConeGeometry(0.03, 0.06, 4), darkMat, x, 0.1, 0, head);
    } else {
      add(new THREE.BoxGeometry(0.08, 0.06, 0.08), darkMat, 0, -0.025, 0.1, head); // museau
      for (const x of [-0.075, 0.075]) add(new THREE.BoxGeometry(0.03, 0.08, 0.05), darkMat, x, 0.0, -0.01, head);
    }
    for (const x of [-0.035, 0.035]) add(new THREE.BoxGeometry(0.02, 0.02, 0.01), black, x, 0.025, 0.072, head);
    // Pattes (pivot en haut pour les balancer).
    for (const [x, z] of [[-0.05, 0.11], [0.05, 0.11], [-0.05, -0.11], [0.05, -0.11]] as const) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x * s, 0.12 * s, z * s);
      add(new THREE.BoxGeometry(0.045 * s, 0.12 * s, 0.045 * s), darkMat, 0, -0.06 * s, 0, pivot);
      this.root.add(pivot);
      this.legs.push(pivot);
    }
    this.tail = new THREE.Object3D();
    this.tail.position.set(0, 0.21 * s, -0.16 * s);
    add(new THREE.BoxGeometry(0.03, 0.03, cat ? 0.2 : 0.12), furMat, 0, cat ? 0.05 : 0.03, -0.05, this.tail).rotation.x = cat ? -0.9 : -0.6;
    this.root.add(this.tail);
    this.root.scale.setScalar(PET_SCALE);
  }

  /** Suit le maître (position et orientation de sa racine 3D). */
  follow(owner: THREE.Object3D, moving: boolean, dt: number): void {
    const heading = owner.rotation.y;
    const target = new THREE.Vector3(
      owner.position.x - Math.sin(heading) * FOLLOW_DISTANCE + Math.cos(heading) * FOLLOW_SIDE,
      owner.position.y,
      owner.position.z - Math.cos(heading) * FOLLOW_DISTANCE - Math.sin(heading) * FOLLOW_SIDE,
    );
    const before = this.root.position.clone();
    if (this.root.position.lengthSq() === 0) this.root.position.copy(target);
    this.root.position.lerp(target, Math.min(1, dt * 6));
    const step = this.root.position.distanceTo(before);
    if (step > 0.001) this.root.rotation.y = Math.atan2(this.root.position.x - before.x, this.root.position.z - before.z);
    else if (!moving) this.root.rotation.y += (heading - this.root.rotation.y) * Math.min(1, dt * 2);

    const walking = moving || step > 0.004;
    this.phase += dt * (walking ? 14 : 3);
    const swing = walking ? Math.sin(this.phase) * 0.6 : 0;
    this.legs.forEach((leg, k) => (leg.rotation.x = k % 3 === 0 ? swing : -swing));
    this.tail.rotation.y = Math.sin(this.phase * (walking ? 0.8 : 2.5)) * 0.5;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
