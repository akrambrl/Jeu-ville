/** Aperçu 3D du personnage dans l'écran de création (il tourne doucement). */
import * as THREE from 'three';
import { BODY_TYPES, type CharacterLook } from '@jeu-ville/shared';
import { cloneModel, loadModel } from '../world/assets.js';
import { modelForLook } from '../world/characters.js';

export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private readonly holder = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly clock = new THREE.Clock();
  private request = 0;

  constructor(width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.canvas = this.renderer.domElement;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0.55, 3);
    this.camera.lookAt(0, 0.45, 0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.6));
    const key = new THREE.DirectionalLight(0xfff0d4, 2);
    key.position.set(2, 3, 3);
    this.scene.add(key, this.holder);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9cdb4 }));
    this.scene.add(floor);
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      this.holder.rotation.y += dt * 0.6;
      this.mixer?.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  async show(look: CharacterLook): Promise<void> {
    const id = ++this.request;
    const gltf = await loadModel('characters', modelForLook(look));
    if (id !== this.request) return;
    this.holder.clear();
    const body = cloneModel(gltf);
    const box = new THREE.Box3().setFromObject(body);
    const s = 1 / (box.max.y - box.min.y);
    const width = (BODY_TYPES[look.bodyType] ?? BODY_TYPES[1]).width;
    body.scale.set(s * width, s, s * width);
    this.holder.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    const idle = gltf.animations.find((a) => a.name === 'idle');
    if (idle) this.mixer.clipAction(idle).play();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
