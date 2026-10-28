/**
 * Ce qu'on voit d'une mission du quotidien : zone de recherche, objet perdu
 * (chien, portefeuille) quand on s'en approche, et ce qui suit le joueur
 * (chien retrouvé, mamie et ses courses) ou ce qu'il porte (outils…).
 */
import * as THREE from 'three';
import { ERRANDS, type ErrandOffer, type ErrandView, type MapGrid } from '@jeu-ville/shared';
import { Character3D } from './characters.js';
import { groundTop } from './ground.js';
import { Pet3D } from './pets.js';

/** Robe du chien perdu (voir pets.ts). */
const LOST_DOG = 'dog:1';
/** La mamie marche un peu derrière le joueur (cases). */
const ESCORT_DISTANCE = 0.9;
const CARRY_ICONS: Record<string, string> = { tools: '🧰', wallet: '👛' };

export class ErrandScene {
  private readonly group = new THREE.Group();
  private area: THREE.Mesh | null = null;
  private hidden: { obj: THREE.Object3D; x: number; y: number } | null = null;
  private dog: Pet3D | null = null;
  private granny: Character3D | null = null;
  private view: ErrandView | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly grid: MapGrid,
    private readonly self: () => Character3D | undefined,
    /** Cache (ou réaffiche) l'habitant resté à sa place pendant qu'il nous suit. */
    private readonly hideGiver: (offerId: string, hidden: boolean) => void,
  ) {
    scene.add(this.group);
  }

  set(view: ErrandView, offer: ErrandOffer | undefined): void {
    const previous = this.view;
    this.view = view;
    this.clear();
    if (previous?.kind === 'active') this.hideGiver(previous.offerId, false);
    this.self()?.setMark(null);
    if (view.kind !== 'active') return;

    if (view.area) {
      const ring = new THREE.Mesh(
        new THREE.CircleGeometry(view.area.r, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      ring.position.set(view.area.x, this.top(view.area.x, view.area.y) + 0.03, view.area.y);
      ring.renderOrder = 1;
      this.area = ring;
      this.group.add(ring);
    }
    if (view.hidden) {
      const obj = view.hidden.kind === 'dog' ? new Pet3D(LOST_DOG).root : walletMesh();
      const { x, y } = view.hidden.at;
      obj.position.set(x, this.top(x, y), y);
      obj.visible = false;
      this.hidden = { obj, x, y };
      this.group.add(obj);
    }
    if (view.carry === 'dog') {
      this.dog = new Pet3D(LOST_DOG);
      this.group.add(this.dog.root);
    } else if (view.carry === 'granny' && offer) {
      const g = offer.giver;
      const me = this.self();
      this.granny = new Character3D((x, y) => this.grid.tileAt(x, y), me?.tileX ?? g.x, me?.tileY ?? g.y);
      void this.granny.load({ sex: g.sex, baseLook: g.baseLook, skinTone: g.skinTone, hairColor: g.hairColor });
      this.granny.setMark('🛍️');
      this.group.add(this.granny.root);
      this.hideGiver(view.offerId, true);
    } else if (view.carry && CARRY_ICONS[view.carry]) {
      this.self()?.setMark(CARRY_ICONS[view.carry]!);
    }
  }

  update(dt: number): void {
    const me = this.self();
    if (!me) return;
    if (this.hidden) {
      this.hidden.obj.visible = Math.hypot(this.hidden.x - me.tileX, this.hidden.y - me.tileY) <= ERRANDS.revealRadius;
      this.hidden.obj.rotation.y += dt * 1.5;
    }
    this.dog?.follow(me.root, me.isMoving, dt);
    if (this.granny) {
      const h = me.root.rotation.y;
      const x = me.tileX - Math.sin(h) * ESCORT_DISTANCE;
      const y = me.tileY - Math.cos(h) * ESCORT_DISTANCE;
      this.granny.setTarget(x, y, me.isMoving);
      this.granny.update(dt);
    }
  }

  private clear(): void {
    this.area?.geometry.dispose();
    this.area = null;
    this.hidden = null;
    this.dog = null;
    this.granny?.dispose();
    this.granny = null;
    this.group.clear();
  }

  private top(x: number, y: number): number {
    return groundTop(this.grid.tileAt(Math.round(x), Math.round(y)));
  }
}

/** Portefeuille posé au sol, qui brille un peu pour se faire repérer. */
function walletMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.15), leather);
  body.position.y = 0.04;
  const glint = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.06),
    new THREE.MeshStandardMaterial({ color: 0xfff3a8, emissive: 0xffd36b, emissiveIntensity: 0.8 }),
  );
  glint.position.y = 0.3;
  g.add(body, glint);
  return g;
}
