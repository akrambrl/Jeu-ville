/**
 * Vue 3D de la ville (Three.js) : caméra libre façon Sims (glisser pour se
 * déplacer, deux doigts ou clic droit pour tourner, pincer/molette pour zoomer),
 * toucher le sol pour marcher. Le serveur reste maître des positions.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BODY_TYPES, MapGrid, type CharacterLook, type DistrictMap, type MapPoi, type TilePoint } from '@jeu-ville/shared';
import type { DistrictLink, PlayerView } from '../net/link.js';
import { Ambient } from './ambient.js';
import { buildBuildings } from './buildings.js';
import { Character3D, modelForLook } from './characters.js';
import { buildGround, groundTop } from './ground.js';
import { buildProps } from './props.js';
import { canvasTexture } from './textures.js';

export interface CityViewOptions {
  map: DistrictMap;
  link: DistrictLink;
  homeDoor: TilePoint | null;
  /** Appelé à chaque image avec la position affichée du joueur local. */
  onLocalPosition: (x: number, y: number) => void;
}

const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 450;
const LABEL_KINDS = new Set<MapPoi['kind']>([
  'townhall',
  'station',
  'park',
  'worship',
  'school',
  'tram',
  'bakery',
  'pharmacy',
  'fastfood',
  'police',
  'supermarket',
]);
/** Au-delà de cette distance caméra, les étiquettes secondaires sont masquées. */
const LABEL_DISTANCE = 26;

export class CityView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labels: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly sun: THREE.DirectionalLight;
  private readonly grid: MapGrid;
  private readonly clock = new THREE.Clock();
  private readonly avatars = new Map<string, Character3D>();
  private readonly marker: THREE.Mesh;
  private ambient: Ambient | null = null;
  private following = true;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private readonly poiLabels: { obj: CSS2DObject; major: boolean }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: CityViewOptions,
  ) {
    this.grid = new MapGrid(opts.map);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'world-labels';
    container.appendChild(this.labels.domElement);

    // Ciel dégradé et brume légère.
    this.scene.background = canvasTexture(4, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#8ec9ef');
      g.addColorStop(1, '#e6f3fb');
      c.fillStyle = g;
      c.fillRect(0, 0, 4, 256);
    });
    this.scene.fog = new THREE.Fog(0xdcecf5, 38, 85);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.3, 300);
    const start = opts.homeDoor ?? opts.map.spawn;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(start.x, 0, start.y);
    // En portrait (téléphone), on recule pour voir autant de ville qu'en paysage.
    const portrait = (container.clientHeight || window.innerHeight) > (container.clientWidth || window.innerWidth);
    const back = portrait ? 17 : 11;
    this.camera.position.set(start.x + back, back * 1.1, start.y + back);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 48;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('start', () => (this.dragged = false));
    this.controls.addEventListener('change', () => {
      if (this.pointerDown) this.dragged = true;
    });

    // Lumière : ciel + soleil chaud avec ombres douces qui suivent la caméra.
    this.scene.add(new THREE.HemisphereLight(0xfdf6e3, 0x6b8f5a, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff0d4, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    this.scene.add(this.marker);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private dragged = false;

  /** Construit la ville (asynchrone : chargement des modèles). */
  async build(): Promise<void> {
    const { map } = this.opts;
    this.scene.add(buildGround(this.grid));
    const buildings = await buildBuildings(this.grid, map.storefronts);
    this.scene.add(buildings.group);
    this.scene.add(await buildProps(this.grid));
    this.ambient = new Ambient(this.grid, map.transit);
    this.scene.add(this.ambient.group);
    void this.ambient.spawnKids();
    void this.ambient.spawnVendors(map.pois);

    // Étiquettes des lieux, au-dessus des toits.
    for (const poi of map.pois) {
      if (!LABEL_KINDS.has(poi.kind)) continue;
      const el = document.createElement('div');
      const major = poi.kind === 'townhall' || poi.kind === 'station';
      el.className = `poi-label${major ? ' major' : ''}`;
      el.textContent = poi.name;
      const obj = new CSS2DObject(el);
      const h = this.grid.isBuilding(poi.x, poi.y) ? buildings.roofHeight(poi.x, poi.y) : 0.3;
      obj.position.set(poi.x, h + 0.7, poi.y);
      this.scene.add(obj);
      this.poiLabels.push({ obj, major });
    }
    this.addStreetNames();
    if (this.opts.homeDoor) {
      const el = document.createElement('div');
      el.className = 'home-tag';
      el.textContent = '🏠 Chez moi';
      const obj = new CSS2DObject(el);
      obj.position.set(this.opts.homeDoor.x, 1.6, this.opts.homeDoor.y);
      this.scene.add(obj);
    }
    this.bindPlayers();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Recentre la caméra sur le joueur. */
  recenter(): void {
    this.following = true;
  }

  requestMove(to: TilePoint): void {
    this.opts.link.move(to);
    this.marker.position.set(to.x, groundTop(this.grid.tileAt(to.x, to.y)) + 0.02, to.y);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.9;
    this.following = true;
  }

  // ---------- Boucle ----------

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    for (const a of this.avatars.values()) a.update(dt);
    this.ambient?.update(dt);
    const markerMat = this.marker.material as THREE.MeshBasicMaterial;
    markerMat.opacity = Math.max(0, markerMat.opacity - dt * 0.8);

    const self = this.avatars.get(this.opts.link.sessionId);
    if (self) {
      this.opts.onLocalPosition(self.tileX, self.tileY);
      if (this.following) {
        // La caméra glisse vers le joueur en gardant son angle.
        const goal = new THREE.Vector3(self.tileX, 0, self.tileY);
        const delta = goal.sub(this.controls.target).multiplyScalar(Math.min(1, dt * 4));
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    this.controls.update();

    // Le soleil (et sa zone d'ombre) suit le point regardé.
    const t = this.controls.target;
    this.sun.position.set(t.x - 18, 34, t.z + 12);
    this.sun.target.position.copy(t);

    const dist = this.camera.position.distanceTo(t);
    for (const l of this.poiLabels) l.obj.visible = l.major || dist < LABEL_DISTANCE;
    for (const s of this.streetNames) s.visible = dist < LABEL_DISTANCE;

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Entrées ----------

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragged = false;
    });
    el.addEventListener('pointerup', (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > TAP_MAX_MOVE_PX || performance.now() - down.t > TAP_MAX_MS) {
        // C'était un glissement : on laisse la caméra où le joueur l'a mise.
        if (moved > TAP_MAX_MOVE_PX) this.following = false;
        return;
      }
      if (e.button !== 0) return;
      this.tap(e.clientX, e.clientY);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private tap(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return;
    let tile = { x: Math.round(hit.x), y: Math.round(hit.z) };
    // Toucher un bâtiment : on va à la case praticable la plus proche.
    if (!this.grid.isWalkable(tile.x, tile.y)) tile = this.grid.nearestWalkable(tile, 3) ?? tile;
    if (this.grid.isWalkable(tile.x, tile.y)) this.requestMove(tile);
  }

  // ---------- Noms de rues (peints sur la chaussée) ----------

  private readonly streetNames: THREE.Mesh[] = [];

  private addStreetNames(): void {
    for (const s of this.opts.map.streets) {
      const tex = canvasTexture(512, 64, (c) => {
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.font = 'bold 40px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(s.name, 256, 34, 500);
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      if (s.axis === 'y') mesh.rotation.z = Math.PI / 2;
      mesh.position.set(s.x, 0.02, s.y);
      this.scene.add(mesh);
      this.streetNames.push(mesh);
    }
  }

  // ---------- Joueurs ----------

  private bindPlayers(): void {
    const link = this.opts.link;
    link.subscribePlayers({
      added: (id, p) => {
        const c = new Character3D((x, y) => this.grid.tileAt(x, y), p.x, p.y);
        c.setTarget(p.x, p.y, p.moving, p.dir);
        c.setLabel(p.name, id === link.sessionId);
        this.avatars.set(id, c);
        this.scene.add(c.root);
        void c.load(modelForLook(lookOf(p)), (BODY_TYPES[p.bodyType] ?? BODY_TYPES[1]).width);
      },
      changed: (id, p) => this.avatars.get(id)?.setTarget(p.x, p.y, p.moving, p.dir),
      removed: (id) => {
        this.avatars.get(id)?.dispose();
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
