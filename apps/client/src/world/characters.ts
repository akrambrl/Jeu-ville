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
    this.play(this.moving ? walkAnim : 'idle');
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
