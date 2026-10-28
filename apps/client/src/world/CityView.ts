/**
 * Vue 3D de la ville (Three.js) : caméra libre façon Sims (glisser pour se
 * déplacer, deux doigts ou clic droit pour tourner, pincer/molette pour zoomer),
 * toucher le sol pour marcher. Le serveur reste maître des positions.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BODY_TYPES, MapGrid, TRAVEL, type Arrival, type CharacterLook, type DistrictMap, type MapPoi, type TilePoint } from '@jeu-ville/shared';
import type { DistrictLink, PlayerView } from '../net/link.js';
import { Ambient, busMesh } from './ambient.js';
import { buildBuildings } from './buildings.js';
import { Character3D, modelForLook } from './characters.js';
import { buildGround, groundTop } from './ground.js';
import { Pet3D } from './pets.js';
import { buildProps } from './props.js';
import { clockFromUrl, daylightAt, type Daylight } from './daylight.js';
import { applyNight } from './night.js';
import { canvasTexture } from './textures.js';

export interface CityViewOptions {
  map: DistrictMap;
  link: DistrictLink;
  homeDoor: TilePoint | null;
  /** Appelé à chaque image avec la position affichée du joueur local. */
  onLocalPosition: (x: number, y: number) => void;
}

const TAP_MAX_MOVE_PX = 8;
/** Cinématique d'arrivée en bus (secondes) : approche, arrêt portes ouvertes, départ. */
const BUS_ARRIVE_S = TRAVEL.busArriveMs / 1000;
const BUS_STOP_S = TRAVEL.busStopMs / 1000;
const BUS_LEAVE_S = TRAVEL.busLeaveMs / 1000;
/** Distance (cases) d'où le bus arrive et où il repart. */
const BUS_RUN_TILES = 12;
/** Recalcul de la lumière du jour (ms). */
const DAYLIGHT_REFRESH_MS = 30_000;
/** Le repère de destination disparaît quand le joueur est à moins de cette distance (cases). */
const MARKER_ARRIVED = 0.35;
/** Sans déplacement après ce délai (chemin refusé), le repère s'efface aussi. */
const MARKER_IDLE_TIMEOUT = 1.2;
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
  'market',
  'square',
  'gym',
  'quarter',
  'cycles',
  'petshop',
  'realestate',
  'jobcenter',
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
  private readonly hemi: THREE.HemisphereLight;
  private readonly sky = document.createElement('canvas');
  private readonly skyTexture: THREE.CanvasTexture;
  private daylight: Daylight;
  private readonly now = clockFromUrl(location.search);
  private readonly grid: MapGrid;
  private readonly clock = new THREE.Clock();
  private readonly avatars = new Map<string, Character3D>();
  private readonly pets = new Map<string, Pet3D>();
  private readonly marker = new THREE.Group();
  private readonly markerRing: THREE.Mesh;
  private readonly markerArrow: THREE.Mesh;
  private readonly markerMaterials: THREE.MeshBasicMaterial[] = [];
  private markerTarget: TilePoint | null = null;
  private markerAge = 0;
  private markerOpacity = 0;
  private ambient: Ambient | null = null;
  private readonly arrivals: { bus: THREE.Group; who: string; from: THREE.Vector3; to: THREE.Vector3; leave: THREE.Vector3; t: number; landed: boolean }[] = [];
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

    // Ciel dégradé et brume légère (couleurs selon l'heure, voir applyDaylight).
    this.sky.width = 128;
    this.sky.height = 256;
    this.skyTexture = new THREE.CanvasTexture(this.sky);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTexture;
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
    this.hemi = new THREE.HemisphereLight(0xfdf6e3, 0x6b8f5a, 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d4, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // Repère de destination : case surlignée, anneau pulsant et flèche qui rebondit.
    const markerMat = (color: number) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      this.markerMaterials.push(m);
      return m;
    };
    const tileHighlight = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), markerMat(0xffd84d));
    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32).rotateX(-Math.PI / 2), markerMat(0xffffff));
    this.markerRing.position.y = 0.01;
    this.markerArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI), markerMat(0xffb400));
    this.marker.add(tileHighlight, this.markerRing, this.markerArrow);
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.daylight = daylightAt(this.now());
    this.applyDaylight();
    window.setInterval(() => {
      this.daylight = daylightAt(this.now());
      this.applyDaylight();
    }, DAYLIGHT_REFRESH_MS);

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
    this.ambient = new Ambient(this.grid, map);
    this.scene.add(this.ambient.group);
    void this.ambient.spawnVendors(map.vendors);

    // Étiquettes des lieux, au-dessus des toits.
    for (const poi of map.pois) {
      if (!LABEL_KINDS.has(poi.kind)) continue;
      const el = document.createElement('div');
      const major = poi.kind === 'townhall' || poi.kind === 'station' || poi.kind === 'quarter';
      el.className = `poi-label${major ? ' major' : ''}`;
      el.textContent = poi.name;
      const obj = new CSS2DObject(el);
      const h = this.grid.isBuilding(poi.x, poi.y) ? buildings.roofHeight(poi.x, poi.y) : 0.3;
      obj.position.set(poi.x, h + 0.7, poi.y);
      this.scene.add(obj);
      this.poiLabels.push({ obj, major });
    }
    this.addStreetNames();
    // Les matériaux qui s'allument la nuit viennent d'être créés.
    this.applyDaylight();
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
    this.marker.visible = true;
    this.markerTarget = to;
    this.markerAge = 0;
    this.following = true;
  }

  // ---------- Boucle ----------

  private frame(): void {
    const dt = Math.min(0.1, this.clock.getDelta());
    for (const a of this.avatars.values()) a.update(dt);
    for (const [id, pet] of this.pets) {
      const owner = this.avatars.get(id);
      if (owner) {
        pet.root.visible = owner.root.visible;
        pet.follow(owner.root, owner.isMoving, dt);
      }
    }
    this.ambient?.update(dt, { x: this.controls.target.x, y: this.controls.target.z });
    const self = this.avatars.get(this.opts.link.sessionId);
    this.updateMarker(dt, self);
    this.updateArrivals(dt);
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

    // Le soleil (ou la lune) et sa zone d'ombre suivent le point regardé.
    const t = this.controls.target;
    this.sun.position.copy(this.daylight.lightDir).multiplyScalar(40).add(t);
    this.sun.target.position.copy(t);

    const dist = this.camera.position.distanceTo(t);
    for (const l of this.poiLabels) l.obj.visible = l.major || dist < LABEL_DISTANCE;
    for (const s of this.streetNames) s.visible = dist < LABEL_DISTANCE;

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /** Arrivée en bus : un bus vient se garer, le perso en descend et marche jusqu'à sa destination. */
  playArrival(a: Arrival): void {
    const along = (dx: number, dy: number) => {
      const t = this.grid.tileAt(a.curb.x + dx, a.curb.y + dy);
      return t === 'R' || t === 'M';
    };
    const axisX = along(1, 0) || along(-1, 0);
    // Le bus arrive par le côté où la chaussée continue.
    const sign = axisX ? (along(-1, 0) ? -1 : 1) : along(0, -1) ? -1 : 1;
    const to = new THREE.Vector3(a.curb.x, 0, a.curb.y);
    const from = to.clone().add(new THREE.Vector3(axisX ? sign * BUS_RUN_TILES : 0, 0, axisX ? 0 : sign * BUS_RUN_TILES));
    const bus = busMesh('BUS');
    bus.position.copy(from);
    bus.rotation.y = axisX ? (sign > 0 ? Math.PI : 0) : sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(bus);
    // Il descend sur le trottoir (sa position donnée par le serveur), caché le temps que le bus arrive.
    const avatar = this.avatars.get(a.playerId);
    if (avatar) {
      avatar.teleport(a.at.x, a.at.y);
      avatar.root.visible = false;
    }
    // Il repart tout droit si la rue continue, sinon il fait demi-tour.
    const ahead = to.clone().sub(from).normalize();
    const continues = along(Math.round(ahead.x), Math.round(ahead.z)) && along(Math.round(ahead.x * 2), Math.round(ahead.z * 2));
    const leave = continues ? to.clone().add(ahead.multiplyScalar(BUS_RUN_TILES)) : from.clone();
    if (a.playerId === this.opts.link.sessionId) {
      // La caméra saute à l'arrêt.
      const delta = new THREE.Vector3(a.at.x, 0, a.at.y).sub(this.controls.target);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
      this.following = true;
      this.marker.visible = false;
    }
    this.arrivals.push({ bus, who: a.playerId, from, to, leave, t: 0, landed: false });
  }

  private updateArrivals(dt: number): void {
    for (const a of this.arrivals) {
      a.t += dt;
      const ease = (u: number) => 1 - (1 - u) ** 3;
      if (a.t < BUS_ARRIVE_S) {
        a.bus.position.lerpVectors(a.from, a.to, ease(a.t / BUS_ARRIVE_S));
      } else if (a.t < BUS_ARRIVE_S + BUS_STOP_S) {
        a.bus.position.copy(a.to);
        if (!a.landed) {
          a.landed = true;
          const avatar = this.avatars.get(a.who);
          if (avatar) avatar.root.visible = true;
        }
      } else {
        const u = (a.t - BUS_ARRIVE_S - BUS_STOP_S) / BUS_LEAVE_S;
        const dir = a.leave.clone().sub(a.to);
        a.bus.position.copy(a.to).addScaledVector(dir, u * u);
        a.bus.rotation.y = -Math.atan2(dir.z, dir.x);
      }
    }
    for (const a of this.arrivals.filter((x) => x.t >= BUS_ARRIVE_S + BUS_STOP_S + BUS_LEAVE_S)) a.bus.removeFromParent();
    for (let k = this.arrivals.length - 1; k >= 0; k--) if (this.arrivals[k]!.t >= BUS_ARRIVE_S + BUS_STOP_S + BUS_LEAVE_S) this.arrivals.splice(k, 1);
  }

  /** Le repère reste affiché tant que le joueur n'est pas arrivé, puis s'efface. */
  private updateMarker(dt: number, self: Character3D | undefined): void {
    if (!this.marker.visible) return;
    this.markerAge += dt;
    const target = this.markerTarget;
    const arrived =
      !target ||
      !self ||
      Math.hypot(self.tileX - target.x, self.tileY - target.y) < MARKER_ARRIVED ||
      (this.markerAge > MARKER_IDLE_TIMEOUT && !self.isMoving);
    if (arrived) this.markerTarget = null;
    this.markerOpacity = arrived ? Math.max(0, this.markerOpacity - dt * 2.5) : Math.min(1, this.markerOpacity + dt * 6);
    if (this.markerOpacity === 0 && arrived) {
      this.marker.visible = false;
      return;
    }
    const pulse = (Math.sin(this.markerAge * 5) + 1) / 2;
    const [tileMat, ringMat, arrowMat] = this.markerMaterials;
    tileMat!.opacity = 0.45 * this.markerOpacity;
    ringMat!.opacity = (0.6 + 0.4 * pulse) * this.markerOpacity;
    arrowMat!.opacity = this.markerOpacity;
    this.markerRing.scale.setScalar(0.85 + 0.25 * pulse);
    this.markerArrow.position.y = 0.55 + 0.12 * Math.abs(Math.sin(this.markerAge * 4));
    this.markerArrow.rotation.y += dt * 2;
  }

  /** Couleurs du ciel, brume, lumières et éclairages nocturnes selon l'heure réelle. */
  private applyDaylight(): void {
    const d = this.daylight;
    const c = this.sky.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${d.skyTop.getHexString()}`);
    g.addColorStop(1, `#${d.skyBottom.getHexString()}`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 256);
    if (d.night > 0.3) {
      // Étoiles (toujours les mêmes).
      let s = 7;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      c.fillStyle = `rgba(255,255,255,${(d.night - 0.3) * 1.2})`;
      for (let k = 0; k < 90; k++) c.fillRect(rand() * 128, rand() * 150, rand() < 0.2 ? 2 : 1, 1);
    }
    this.skyTexture.needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.copy(d.fog);
    this.hemi.color.copy(d.hemiSky);
    this.hemi.groundColor.copy(d.hemiGround);
    this.hemi.intensity = d.hemiIntensity;
    this.sun.color.copy(d.lightColor);
    this.sun.intensity = d.lightIntensity;
    this.renderer.toneMappingExposure = d.exposure;
    applyNight(d.night);
    document.body.classList.toggle('night', d.night > 0.5);
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

  /** Crée, remplace ou retire l'animal qui suit le perso `id`. */
  private syncPet(id: string, look: string | undefined): void {
    const current = this.pets.get(id);
    if ((current?.look ?? '') === (look ?? '')) return;
    current?.dispose();
    this.pets.delete(id);
    if (!look) return;
    const pet = new Pet3D(look);
    this.pets.set(id, pet);
    this.scene.add(pet.root);
  }

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
        this.syncPet(id, p.pet);
        c.setVehicle(p.vehicle ?? '');
      },
      changed: (id, p) => {
        // Pendant l'arrivée en bus, le perso attend dans le bus.
        if (this.arrivals.some((a) => a.who === id && !a.landed)) return;
        this.avatars.get(id)?.setTarget(p.x, p.y, p.moving, p.dir);
        this.avatars.get(id)?.setVehicle(p.vehicle ?? '');
        this.syncPet(id, p.pet);
      },
      removed: (id) => {
        this.avatars.get(id)?.dispose();
        this.avatars.delete(id);
        this.syncPet(id, '');
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
